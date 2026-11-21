import "server-only";
import type postgres from "postgres";
import { formatPoints } from "@/lib/shared/scoring";
import { logAudit, type Actor } from "../audit";
import { canActAsCaptain, type RequestContext } from "../context";
import { db } from "../db";
import { readLiveState, ring, type LiveState } from "../live";
import { isUuid } from "../teams";
import type { Env } from "../tokens";
import { signedPhotoUrl } from "../uploads";
import { botAnswer, isGivenAnswer, parseAnswer, scoreTeams, type StoredAnswer } from "./answers";
import {
  answerAllowed,
  checkExpectation,
  findQuestion,
  jokerAllowed,
  normalize,
  transition,
  type Command,
  type Expectation,
} from "./engine";
import {
  findDemoQuizId,
  findMainQuizId,
  listQuizzes,
  loadContent,
  strings,
  syncPhotoVersions,
  toQuestion,
  type QuestionRow,
  type Sql,
} from "./content";
import { fairnessFor } from "./fairness";
import { quizStandings, type AnswerBook } from "./scores";
import type { ConsoleView, EngineState, QuestionType, QuizView, TeamColor } from "./types";
import { buildConsoleView, buildQuizView, questionIsOut, viewerSeesQuestion, type TeamRow, type Viewer } from "./view";

/**
 * The quiz in the database: loading the content and the live state,
 * building the role-aware views, and every write (console steps, answers,
 * jokers, corrections and the test teams that answer by themselves). Each
 * write locks the live_state row, checks the rules of engine.ts, writes,
 * and rings the doorbell after the commit.
 */

export { ensureMainQuiz, findDemoQuizId, findMainQuizId, listQuizzes, loadContent, toQuestion, type Sql } from "./content";

/** Signed photo links for quiz questions live five minutes. */
const PHOTO_TTL_S = 300;

/* ------------------------------------------------------------------------ */
/* State, teams, answers and jokers.                                         */
/* ------------------------------------------------------------------------ */

export function toEngineState(live: LiveState): EngineState {
  return {
    mode: live.mode,
    quizId: live.quizId,
    roundNo: live.roundNo,
    questionId: live.questionId,
    phase: live.phase,
    listening: live.listening,
    countdownUntil: live.countdownUntil ? Date.parse(live.countdownUntil) : null,
  };
}

type LiveRow = {
  mode: EngineState["mode"];
  quiz_id: string | null;
  round_no: number | null;
  question_id: string | null;
  phase: EngineState["phase"];
  listening: boolean;
  countdown_until: Date | null;
  lock_closed: boolean;
  version: string;
};

/** Lock the live state: `for update` for steps, `for share` for answers (captains answer side by side). */
async function lockState(env: Env, sql: postgres.TransactionSql, strength: "update" | "share"): Promise<EngineState & { lockClosed: boolean }> {
  const rows =
    strength === "update"
      ? await sql<LiveRow[]>`
          select mode, quiz_id, round_no, question_id, phase, listening, countdown_until, lock_closed, version
          from valk.live_state where env = ${env} for update
        `
      : await sql<LiveRow[]>`
          select mode, quiz_id, round_no, question_id, phase, listening, countdown_until, lock_closed, version
          from valk.live_state where env = ${env} for share
        `;
  const row = rows[0];
  if (!row) throw new Error(`live_state ontbreekt voor ${env}.`);
  return {
    mode: row.mode,
    quizId: row.quiz_id,
    roundNo: row.round_no,
    questionId: row.question_id,
    phase: row.phase,
    listening: row.listening,
    countdownUntil: row.countdown_until ? row.countdown_until.getTime() : null,
    lockClosed: row.lock_closed,
  };
}

async function writeState(env: Env, state: EngineState, sql: postgres.TransactionSql): Promise<void> {
  await sql`
    update valk.live_state set
      mode = ${state.mode},
      quiz_id = ${state.quizId},
      round_no = ${state.roundNo},
      question_id = ${state.questionId},
      phase = ${state.phase},
      listening = ${state.listening},
      countdown_until = ${state.countdownUntil === null ? null : new Date(state.countdownUntil)},
      updated_at = now()
    where env = ${env}
  `;
}

/** The teams of an environment, with the name for "Sanne heeft gekozen". */
export async function loadTeams(env: Env, sql: Sql = db()): Promise<TeamRow[]> {
  const rows = await sql<{ id: string; name: string; color: TeamColor; has_device: boolean; captain_name: string | null }[]>`
    select t.id, t.name, t.color, t.active_device_id is not null as has_device,
      coalesce(
        (select coalesce(nullif(trim(p.nickname), ''), p.name) from valk.participants p
          where p.env = t.env and p.team_id = t.id and t.active_device_id is not null
            and p.claimed_device_id = t.active_device_id
          order by p.is_captain desc, p.claimed_at limit 1),
        (select coalesce(nullif(trim(p.nickname), ''), p.name) from valk.participants p
          where p.env = t.env and p.team_id = t.id and p.is_captain
          order by p.sort, lower(p.name) limit 1)
      ) as captain_name
    from valk.teams t
    where t.env = ${env}
    order by t.sort, lower(t.name)
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, hasDevice: row.has_device, captainName: row.captain_name }));
}

/** Quiz jokers: team id → round number. */
export async function loadJokers(env: Env, sql: Sql = db()): Promise<Record<string, number>> {
  const rows = await sql<{ team_id: string; round_no: number }[]>`
    select team_id, round_no from valk.jokers where env = ${env} and kind = 'quiz' and round_no is not null
  `;
  return Object.fromEntries(rows.map((row) => [row.team_id, row.round_no]));
}

type AnswerRow = { question_id: string; team_id: string; answer: unknown; override_twelfths: number | null };

function toBook(rows: readonly AnswerRow[]): Record<string, Record<string, StoredAnswer>> {
  const book: Record<string, Record<string, StoredAnswer>> = {};
  for (const row of rows) {
    book[row.question_id] ??= {};
    book[row.question_id][row.team_id] = { answer: row.answer, overrideTwelfths: row.override_twelfths };
  }
  return book;
}

export async function loadAnswers(env: Env, questionId: string, sql: Sql = db()): Promise<Record<string, StoredAnswer>> {
  const rows = await sql<AnswerRow[]>`
    select question_id, team_id, answer, override_twelfths
    from valk.quiz_answers where env = ${env} and question_id = ${questionId}
  `;
  return toBook(rows)[questionId] ?? {};
}

/** Every answer to the questions of one quiz in one environment. */
export async function loadAnswerBook(env: Env, quizId: string, sql: Sql = db()): Promise<AnswerBook> {
  const rows = await sql<AnswerRow[]>`
    select a.question_id, a.team_id, a.answer, a.override_twelfths
    from valk.quiz_answers a
    join valk.quiz_questions q on q.id = a.question_id
    join valk.quiz_rounds r on r.id = q.round_id
    where a.env = ${env} and r.quiz_id = ${quizId}
  `;
  return toBook(rows);
}

export type Submitter = { name: string; displayName: string; team: string | null };

/** Who sent each photo in (echt_of_ai), per upload id. */
export async function loadSubmitters(env: Env, uploadIds: readonly string[], sql: Sql = db()): Promise<Record<string, Submitter>> {
  const ids = uploadIds.filter(isUuid);
  if (ids.length === 0) return {};
  const rows = await sql<{ id: string; name: string | null; nickname: string | null; team: string | null }[]>`
    select u.id, p.name, nullif(trim(p.nickname), '') as nickname, t.name as team
    from valk.uploads u
    left join valk.uploads o on o.id = u.original_id
    left join valk.participants p on p.id = coalesce(u.participant_id, o.participant_id) and p.env = ${env}
    left join valk.teams t on t.id = p.team_id
    where u.id in ${sql(ids)}
  `;
  const result: Record<string, Submitter> = {};
  for (const row of rows) if (row.name) result[row.id] = { name: row.name, displayName: row.nickname ?? row.name, team: row.team };
  return result;
}

/** "Oom Kees, Team Oranje" */
export function submitterLabel(submitter: Submitter | undefined): string | null {
  if (!submitter) return null;
  return submitter.team ? `${submitter.displayName}, ${submitter.team}` : submitter.displayName;
}

function labels(submitters: Record<string, Submitter>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, submitter] of Object.entries(submitters)) result[id] = submitterLabel(submitter) ?? "";
  return result;
}

function names(submitters: Record<string, Submitter>): Record<string, string> {
  return Object.fromEntries(Object.entries(submitters).map(([id, submitter]) => [id, submitter.name]));
}

/* ------------------------------------------------------------------------ */
/* Views.                                                                    */
/* ------------------------------------------------------------------------ */

export function viewerOf(ctx: RequestContext): Viewer {
  if (canActAsCaptain(ctx) && ctx.captainTeam) {
    return { role: "captain", teamId: ctx.captainTeam.id, captainTakenOver: false, suggestCaptainLogin: false };
  }
  return {
    role: ctx.ownTeamId ? "meekijker" : "bezoeker",
    teamId: ctx.ownTeamId,
    captainTakenOver: ctx.captainTakenOver,
    suggestCaptainLogin: ctx.names.some((name) => name.isCaptain),
  };
}

/** Standings are only computed where they are shown. */
function needsStandings(state: EngineState): boolean {
  return state.phase === "tussenstand" || state.phase === "einde";
}

/** The quiz as this phone may see it (GET /api/quiz/state and the first render of /quiz). */
export async function quizViewFor(ctx: RequestContext): Promise<QuizView> {
  const env = ctx.env;
  // Read the version before the data: a ring in between then only causes one extra fetch.
  const live = await readLiveState(env);
  const now = Date.now();
  const state = normalize(toEngineState(live), now);
  const [content, teams, jokers] = await Promise.all([
    state.quizId ? loadContent(state.quizId) : Promise.resolve(null),
    loadTeams(env),
    loadJokers(env),
  ]);
  const viewer = viewerOf(ctx);
  const found = content ? findQuestion(content, state.questionId) : null;
  const out = content !== null && found !== null && questionIsOut(state, now);
  const sees = out && viewerSeesQuestion(state, now, viewer.role);
  const [answers, book, photoUrl, submitters] = await Promise.all([
    out && found ? loadAnswers(env, found.question.id) : Promise.resolve({}),
    content && needsStandings(state) && !live.lockClosed ? loadAnswerBook(env, content.id) : Promise.resolve(null),
    sees && found?.question.photoUploadId
      ? signedPhotoUrl(found.question.displayPhotoId ?? found.question.photoUploadId, PHOTO_TTL_S)
      : Promise.resolve(null),
    sees && found?.question.kind === "echt_of_ai" && found.question.photoUploadId
      ? loadSubmitters(env, [found.question.photoUploadId])
      : Promise.resolve({} as Record<string, Submitter>),
  ]);
  return buildQuizView({
    env,
    version: live.version,
    now,
    state,
    lockClosed: live.lockClosed,
    content,
    teams,
    answers,
    jokers,
    standings: content && book ? quizStandings(content, book, jokers, teams.map((team) => team.id)) : null,
    viewer,
    photoUrl,
    submitter: found?.question.photoUploadId ? submitterLabel(submitters[found.question.photoUploadId]) : null,
  });
}

/** A quiz that is not running anymore and was never started, for the console's start card. */
async function defaultQuizId(env: Env, state: EngineState): Promise<string | null> {
  if (state.quizId) return state.quizId;
  return env === "test" ? ((await findDemoQuizId()) ?? (await findMainQuizId())) : findMainQuizId();
}

/** Everything for the quizmaster (GET /api/quiz/console). */
export async function consoleViewFor(env: Env, reviewId: string | null): Promise<ConsoleView> {
  const live = await readLiveState(env);
  const now = Date.now();
  const state = normalize(toEngineState(live), now);
  const quizId = await defaultQuizId(env, state);
  const [content, teams, jokers, quizzes] = await Promise.all([
    quizId ? loadContent(quizId) : Promise.resolve(null),
    loadTeams(env),
    loadJokers(env),
    listQuizzes(),
  ]);
  const photoIds = content ? content.rounds.flatMap((round) => round.questions.flatMap((q) => (q.photoUploadId ? [q.photoUploadId] : []))) : [];
  const fairnessEnv: Env = content?.isDemo ? "test" : "live";
  const [book, submitters, people, fairnessTeams] = await Promise.all([
    content ? loadAnswerBook(env, content.id) : Promise.resolve({}),
    loadSubmitters(fairnessEnv, photoIds),
    db()<{ name: string; nickname: string | null; team_id: string | null }[]>`
      select name, nickname, team_id from valk.participants where env = ${fairnessEnv}
    `,
    db()<{ id: string; name: string }[]>`select id, name from valk.teams where env = ${fairnessEnv} order by sort, lower(name)`,
  ]);
  const found = content ? findQuestion(content, state.questionId) : null;
  const photoUrl =
    found?.question.photoUploadId && questionIsOut(state, now)
      ? await signedPhotoUrl(found.question.displayPhotoId ?? found.question.photoUploadId, PHOTO_TTL_S)
      : null;
  const fairness = content
    ? fairnessFor(
        content,
        people.map((p) => ({ name: p.name, nickname: p.nickname, teamId: p.team_id })),
        fairnessTeams,
        names(submitters),
      )
    : null;
  return buildConsoleView({
    env,
    version: live.version,
    now,
    state,
    content,
    quizzes: quizzes.filter((quiz) => env === "test" || !quiz.isDemo),
    teams,
    answers: book,
    jokers,
    standings: content ? quizStandings(content, book, jokers, teams.map((team) => team.id)) : [],
    fairnessLines: fairness?.roundLines ?? {},
    submitters: labels(submitters),
    photoUrl,
    reviewId: reviewId && isUuid(reviewId) ? reviewId : null,
    canRestart: env === "test",
    botsAllowed: env === "test",
  });
}

/* ------------------------------------------------------------------------ */
/* Writes.                                                                   */
/* ------------------------------------------------------------------------ */

export type WriteResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

const fail = (error: string, status = 409) => ({ ok: false as const, error, status });

/** Remove the answers and quiz jokers of one environment for one quiz, for a fresh start. */
async function clearProgress(env: Env, quizId: string, sql: postgres.TransactionSql): Promise<void> {
  await sql`
    delete from valk.quiz_answers a
    using valk.quiz_questions q, valk.quiz_rounds r
    where a.question_id = q.id and q.round_id = r.id and r.quiz_id = ${quizId} and a.env = ${env}
  `;
  await sql`delete from valk.jokers where env = ${env} and kind = 'quiz'`;
}

/**
 * One console step (the buttons of the quizmaster). `expect` is what the
 * console saw; when the quiz moved on meanwhile (a double tap, a second
 * console) nothing happens.
 */
export async function runConsoleCommand(
  env: Env,
  actor: Actor,
  command: Command,
  expect: Expectation | null,
): Promise<WriteResult> {
  const result = await db().begin(async (sql) => {
    const stored = await lockState(env, sql, "update");
    const now = Date.now();
    const state = normalize(stored, now);
    const problem = checkExpectation(state, expect, command);
    if (problem) return fail(problem);

    const quizId = command.type === "start" ? command.quizId : state.quizId;
    const content = quizId ? await loadContent(quizId, sql) : null;
    if (command.type === "start") {
      if (!content) return fail("Deze quiz bestaat niet meer.", 404);
      if (env === "live" && content.isDemo) return fail("De demo-quiz is alleen voor de proef.");
      if (env === "live" && state.phase !== null && state.quizId === content.id) {
        return fail("Deze quiz is al begonnen. Kies Ga verder.");
      }
      // The test environment always starts fresh.
      if (env === "test") await clearProgress(env, content.id, sql);
    }

    const next = transition(state, content, command, now);
    if (!next.ok) return fail(next.error);
    await writeState(env, next.state, sql);
    if (next.opened) {
      await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = ${env}`;
    }
    // Echt of AI: the right answer follows the version chosen in the photo admin.
    if (content && ["start", "toon", "volgende", "onthul"].includes(command.type)) await syncPhotoVersions(sql, content);
    await logAudit(
      actor,
      {
        action: "quiz.stap",
        entity: "quiz",
        entityId: next.state.quizId,
        oldValue: { modus: state.mode, ronde: state.roundNo, vraag: state.questionId, fase: state.phase },
        newValue: {
          stap: command.type,
          modus: next.state.mode,
          ronde: next.state.roundNo,
          vraag: next.state.questionId,
          fase: next.state.phase,
          ...(command.type === "luister" ? { luistermodus: command.on } : {}),
        },
      },
      sql,
      env,
    );
    return { ok: true as const };
  });
  if (result.ok) await ring(env);
  return result;
}

/** An answer from the captain device of a team. The last answer counts. */
export async function submitAnswer(
  env: Env,
  teamId: string,
  deviceId: string | null,
  questionId: string,
  raw: unknown,
): Promise<WriteResult<{ answer: unknown }>> {
  if (!isUuid(questionId)) return fail("Deze vraag bestaat niet.", 400);
  const result = await db().begin(async (sql) => {
    const state = await lockState(env, sql, "share");
    const now = Date.now();
    if (!answerAllowed(state, questionId, now)) {
      if (state.questionId !== questionId || state.mode !== "quiz") return fail("Deze vraag is al voorbij.");
      if (state.phase === "open") return fail("De tijd is om. Je antwoord kwam net te laat.");
      return fail("De vraag is gesloten.");
    }
    const [question] = await sql<{ kind: QuestionType; options: unknown }[]>`
      select kind, options from valk.quiz_questions where id = ${questionId}
    `;
    if (!question) return fail("Deze vraag bestaat niet.", 404);
    const answer = parseAnswer({ kind: question.kind, options: Array.isArray(question.options) ? strings(question.options) : null }, raw);
    if (!answer) return fail("Dit antwoord snapt de app niet. Kies opnieuw.", 400);
    await sql`
      insert into valk.quiz_answers (env, question_id, team_id, answer, device_id, answered_at)
      values (${env}, ${questionId}, ${teamId}, ${sql.json(answer)}, ${deviceId}, now())
      on conflict (env, question_id, team_id) do update
        set answer = excluded.answer, device_id = excluded.device_id, answered_at = excluded.answered_at
    `;
    return { ok: true as const, answer };
  });
  if (result.ok) await ring(env);
  return result;
}

/** The captain plays the team's one quiz joker on the round on screen. */
export async function playJoker(env: Env, teamId: string, roundNo: number, by: Actor): Promise<WriteResult> {
  const result = await db().begin(async (sql) => {
    const state = await lockState(env, sql, "share");
    if (!Number.isInteger(roundNo) || !jokerAllowed(state, roundNo)) {
      return fail("De joker kan alleen op het rondescherm, voordat de eerste vraag van de ronde begint.");
    }
    const [already] = await sql<{ round_no: number | null }[]>`
      select round_no from valk.jokers where env = ${env} and team_id = ${teamId} and kind = 'quiz'
    `;
    if (already) return fail(`Jullie joker is al ingezet${already.round_no ? ` in ronde ${already.round_no}` : ""}.`);
    const inserted = await sql`
      insert into valk.jokers (env, team_id, kind, round_no, set_by)
      values (${env}, ${teamId}, 'quiz', ${roundNo}, ${by.name})
      on conflict (env, team_id, kind) do nothing
      returning id
    `;
    if (inserted.length === 0) return fail("Jullie joker is al ingezet.");
    await logAudit(by, { action: "joker.gezet", entity: "team", entityId: teamId, newValue: { soort: "quiz", ronde: roundNo } }, sql, env);
    return { ok: true as const };
  });
  if (result.ok) await ring(env);
  return result;
}

/** The quizmaster sets or removes a quiz joker for a team (a mistap, a dead phone). */
export async function setJokerByAdmin(env: Env, actor: Actor, teamId: string, roundNo: number | null): Promise<WriteResult> {
  if (!isUuid(teamId)) return fail("Dit team bestaat niet.", 400);
  const result = await db().begin(async (sql) => {
    const [team] = await sql<{ name: string }[]>`select name from valk.teams where env = ${env} and id = ${teamId}`;
    if (!team) return fail("Dit team bestaat niet.", 404);
    const [before] = await sql<{ round_no: number | null }[]>`
      select round_no from valk.jokers where env = ${env} and team_id = ${teamId} and kind = 'quiz' for update
    `;
    if (roundNo === null) {
      if (!before) return { ok: true as const };
      await sql`delete from valk.jokers where env = ${env} and team_id = ${teamId} and kind = 'quiz'`;
      await logAudit(
        actor,
        { action: "joker.verwijderd", entity: "team", entityId: teamId, oldValue: { team: team.name, soort: "quiz", ronde: before.round_no } },
        sql,
        env,
      );
      return { ok: true as const };
    }
    await sql`
      insert into valk.jokers (env, team_id, kind, round_no, set_by)
      values (${env}, ${teamId}, 'quiz', ${roundNo}, ${actor.name})
      on conflict (env, team_id, kind) do update set round_no = excluded.round_no, set_by = excluded.set_by, set_at = now()
    `;
    await logAudit(
      actor,
      {
        action: "joker.gezet",
        entity: "team",
        entityId: teamId,
        oldValue: before ? { team: team.name, ronde: before.round_no } : undefined,
        newValue: { team: team.name, soort: "quiz", ronde: roundNo, door: "quizmaster" },
      },
      sql,
      env,
    );
    return { ok: true as const };
  });
  if (result.ok) await ring(env);
  return result;
}

/**
 * "Corrigeer punten": the quizmaster's points for one team on one question
 * (twelfths), or null to go back to the computed points. Logged with the
 * old and the new value.
 */
export async function setOverride(env: Env, actor: Actor, questionId: string, teamId: string, twelfths: number | null): Promise<WriteResult> {
  if (!isUuid(questionId) || !isUuid(teamId)) return fail("Deze vraag of dit team bestaat niet.", 400);
  const result = await db().begin(async (sql) => {
    const [team] = await sql<{ name: string }[]>`select name from valk.teams where env = ${env} and id = ${teamId}`;
    const [row] = await sql<QuestionRow[]>`select * from valk.quiz_questions where id = ${questionId}`;
    if (!team || !row) return fail("Deze vraag of dit team bestaat niet.", 404);
    const question = toQuestion(row);
    const rows = await sql<AnswerRow[]>`
      select question_id, team_id, answer, override_twelfths from valk.quiz_answers
      where env = ${env} and question_id = ${questionId} for update
    `;
    const stored = toBook(rows)[questionId] ?? {};
    // All teams: an estimate is only right when it is the closest.
    const teamIds = (await sql<{ id: string }[]>`select id from valk.teams where env = ${env}`).map((t) => t.id);
    const before = scoreTeams(question, stored, teamIds)[teamId];
    if (twelfths === null) {
      const existing = stored[teamId];
      if (!existing || existing.overrideTwelfths === null) return { ok: true as const };
      if (isGivenAnswer(question, existing.answer)) {
        await sql`
          update valk.quiz_answers set override_twelfths = null, override_by = null
          where env = ${env} and question_id = ${questionId} and team_id = ${teamId}
        `;
      } else {
        await sql`delete from valk.quiz_answers where env = ${env} and question_id = ${questionId} and team_id = ${teamId}`;
      }
    } else {
      await sql`
        insert into valk.quiz_answers (env, question_id, team_id, answer, override_twelfths, override_by)
        values (${env}, ${questionId}, ${teamId}, ${sql.json({})}, ${twelfths}, ${actor.name})
        on conflict (env, question_id, team_id) do update
          set override_twelfths = excluded.override_twelfths, override_by = excluded.override_by
      `;
    }
    const after = twelfths ?? before.computed;
    await logAudit(
      actor,
      {
        action: "quiz.correctie",
        entity: "quiz_vraag",
        entityId: questionId,
        oldValue: { team: team.name, vraag: question.text, punten: formatPoints(before.twelfths) },
        newValue: { team: team.name, vraag: question.text, punten: formatPoints(after), ...(twelfths === null ? { herstel: true } : {}) },
      },
      sql,
      env,
    );
    return { ok: true as const };
  });
  if (result.ok) await ring(env);
  return result;
}

/**
 * "Nepteams antwoorden vanzelf" (test environment only): test teams without
 * a captain device give a plausible answer to the open question. Teams that
 * already answered keep their answer.
 */
export async function answerForBots(env: Env, teamId: string | null): Promise<WriteResult<{ answered: number }>> {
  if (env !== "test") return fail("Nepteams spelen alleen mee in de proef.", 403);
  const result = await db().begin(async (sql) => {
    const state = await lockState(env, sql, "share");
    const now = Date.now();
    if (!state.questionId || !answerAllowed(state, state.questionId, now)) return { ok: true as const, answered: 0 };
    const [row] = await sql<QuestionRow[]>`select * from valk.quiz_questions where id = ${state.questionId}`;
    if (!row) return { ok: true as const, answered: 0 };
    const question = toQuestion(row);
    const teams = await sql<{ id: string }[]>`
      select t.id from valk.teams t
      where t.env = ${env} and t.active_device_id is null
        and (${teamId}::uuid is null or t.id = ${teamId}::uuid)
        and not exists (
          select 1 from valk.quiz_answers a
          where a.env = ${env} and a.question_id = ${question.id} and a.team_id = t.id and a.answer <> '{}'::jsonb
        )
    `;
    let answered = 0;
    for (const team of teams) {
      const answer = botAnswer(question);
      if (!answer) continue;
      await sql`
        insert into valk.quiz_answers (env, question_id, team_id, answer, device_id)
        values (${env}, ${question.id}, ${team.id}, ${sql.json(answer)}, 'nepteam')
        on conflict (env, question_id, team_id) do update set answer = excluded.answer, device_id = excluded.device_id, answered_at = now()
      `;
      answered += 1;
    }
    return { ok: true as const, answered };
  });
  if (result.ok && result.answered > 0) await ring(env);
  return result;
}

/* ------------------------------------------------------------------------ */
/* For the scoreboard.                                                       */
/* ------------------------------------------------------------------------ */

/**
 * The quiz points per team of an environment, in twelfths with the joker
 * round doubled and the quizmaster's corrections included (SPEC §5.1): the
 * quiz the live state points at, or else the main quiz (the demo in the
 * test environment). The scoreboard counts these as the event "Quiz".
 */
export async function quizPointsFor(env: Env): Promise<{ quizId: string | null; standings: ReturnType<typeof quizStandings> }> {
  const live = await readLiveState(env);
  const quizId = live.quizId ?? (env === "test" ? await findDemoQuizId() : await findMainQuizId());
  if (!quizId) return { quizId: null, standings: [] };
  const [content, teams, jokers, book] = await Promise.all([loadContent(quizId), loadTeams(env), loadJokers(env), loadAnswerBook(env, quizId)]);
  if (!content) return { quizId: null, standings: [] };
  return { quizId, standings: quizStandings(content, book, jokers, teams.map((team) => team.id)) };
}
