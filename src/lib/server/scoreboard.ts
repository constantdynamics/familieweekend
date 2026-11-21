import "server-only";
import { cookies } from "next/headers";
import type postgres from "postgres";
import { quizTotals, scoreQuestion, type Answer, type Question } from "@/lib/shared/quizScoring";
import {
  eventMedals,
  formatPoints,
  medalTable,
  standings as rankStandings,
  type EventKind,
  type Medal,
  type ScoreEvent,
} from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import type { TeamColor } from "@/lib/shared/teams";
import { isResultType, rankGame, type GameMode, type GameStatus } from "@/lib/shared/zeskamp";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { lockLiveState, readLiveState, type LiveState } from "./live";
import { getSettings, readSettings } from "./settings";
import type { Env } from "./tokens";

/**
 * The scoreboard (SPEC §4.5 and §5): one ranking over the whole weekend,
 * the medal table, and the lock with its snapshot.
 *
 * - The points come from the quiz (answers, overrides and the quiz joker),
 *   the intermezzo (won duels), the friday games (free points), the six
 *   zeskamp games (place points and jokers) and bonus points.
 * - `assembleScoreboard` is pure: the numbers of SPEC §5.5 are tested on it.
 * - While the lock is closed, everyone except the admin gets the snapshot
 *   that was taken when it closed, plus which parts were played (no points).
 */

type Sql = postgres.Sql | postgres.TransactionSql;

/** live.ts takes a pool; inside a transaction its one query works the same. */
function asPool(sql: Sql): postgres.Sql {
  return sql as unknown as postgres.Sql;
}

const NBSP = " ";

/* ------------------------------------------------------------------------ */
/* Input                                                                     */
/* ------------------------------------------------------------------------ */

export type TeamInfo = { id: string; name: string; color: TeamColor; sort: number };

export type EventInfo = {
  id: string;
  kind: "quiz" | "intermezzo" | "vrijdag" | "zeskamp";
  name: string;
  description: string | null;
  sort: number;
  resultType: string | null;
  unit: string | null;
  mode: GameMode;
  pointsTable: number[] | null;
  jokerAllowed: boolean;
  countsForMedals: boolean;
  status: GameStatus;
  startedAt: string | null;
  startedBy: string | null;
  finishedAt: string | null;
};

export type ResultRow = {
  eventId: string;
  teamId: string;
  rawValue: number | null;
  freeTwelfths: number | null;
  enteredBy: string;
  enteredAt: string;
  clientId: string | null;
};

export type JokerRow = {
  teamId: string;
  kind: "quiz" | "zeskamp";
  roundNo: number | null;
  eventId: string | null;
  setAt: string;
  setBy: string;
};

export type BonusRow = { id: string; teamId: string; twelfths: number; reason: string; givenBy: string; createdAt: string };

/** One answer of a team, with its question. Only questions that count (not the one still open). */
export type QuizAnswerRow = {
  questionId: string;
  teamId: string;
  roundNo: number;
  kind: string;
  correct: unknown;
  scale: string | null;
  answer: unknown;
  overrideTwelfths: number | null;
};

export type ScoreboardInput = {
  env: Env;
  teams: TeamInfo[];
  events: EventInfo[];
  results: ResultRow[];
  jokers: JokerRow[];
  bonus: BonusRow[];
  quizAnswers: QuizAnswerRow[];
  /** The team of the winner of every decided duel (null when the winner left). */
  duelWinners: (string | null)[];
  /** Place points of the zeskamp, whole points (settings). */
  zeskampPoints: number[];
  /** Points per won duel (settings). */
  intermezzoPoints: number;
  /** The quiz or the intermezzo is on right now. */
  quizBusy: boolean;
};

/* ------------------------------------------------------------------------ */
/* Output                                                                    */
/* ------------------------------------------------------------------------ */

export type PartKind = EventKind;

/** One part of the weekend: the quiz, the intermezzo, vrijdag or one zeskamp game. */
export type Part = {
  id: string;
  kind: Exclude<PartKind, "los">;
  /** "Quiz", "Spelletjesmiddag", "Skilopen". */
  name: string;
  /** "Quiz", "Vrijdag", "Spel 3". */
  short: string;
  /** Zeskamp game number, 1 to 6. */
  number: number | null;
  status: GameStatus;
  /** There are points (or results) for this part. */
  played: boolean;
  countsForMedals: boolean;
};

export type BreakdownItem = {
  partId: string;
  kind: PartKind;
  name: string;
  short: string;
  twelfths: number;
  joker: boolean;
  /** Zeskamp place. */
  place: number | null;
  shared: boolean;
  medal: Medal | null;
  /** Bonus points with their reason. */
  reasons: { id: string; reason: string; twelfths: number }[];
};

export type StandingRow = {
  team: TeamInfo;
  place: number;
  shared: boolean;
  twelfths: number;
  breakdown: BreakdownItem[];
};

export type MedalRow = { team: TeamInfo; gold: number; silver: number; bronze: number; place: number; shared: boolean };

export type JokerInfo = {
  teamId: string;
  kind: "quiz" | "zeskamp";
  partId: string | null;
  /** "Quiz, ronde 4" or "Spel 2: Skilopen". */
  partName: string;
  /** For a sentence: "de quiz (ronde 4)" or "spel 2". */
  label: string;
  roundNo: number | null;
  /** The round was played or the game started: the joker is fixed and public. */
  used: boolean;
};

export type GamePlacement = {
  teamId: string;
  value: number | null;
  place: number | null;
  shared: boolean;
  twelfths: number;
  joker: boolean;
};

export type Scoreboard = {
  env: Env;
  teams: TeamInfo[];
  parts: Part[];
  standings: StandingRow[];
  medals: MedalRow[];
  jokers: JokerInfo[];
  /** Places and points per zeskamp game with results. */
  games: Record<string, GamePlacement[]>;
  bonus: BonusRow[];
  /** Nothing scored yet. */
  empty: boolean;
};

/* ------------------------------------------------------------------------ */
/* Assembly (pure)                                                           */
/* ------------------------------------------------------------------------ */

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** A quiz question as stored (SPEC §9.2 shapes) to the shape of quizScoring. */
export function toQuestion(kind: string, correct: unknown, scale: string | null): Question | null {
  const object = record(correct);
  switch (kind) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik": {
      const choice = typeof correct === "number" ? correct : object?.choice;
      return typeof choice === "number" ? { type: kind, correct: { choice } } : null;
    }
    case "waar_niet_waar": {
      const bool = typeof correct === "boolean" ? correct : object?.bool;
      return typeof bool === "boolean" ? { type: kind, correct: { bool } } : null;
    }
    case "echt_of_ai": {
      const value = typeof correct === "string" ? correct : object?.realOrAi;
      return value === "echt" || value === "ai" ? { type: kind, correct: { realOrAi: value } } : null;
    }
    case "schatting": {
      const number = typeof correct === "number" ? correct : object?.number;
      return typeof number === "number" ? { type: kind, correct: { number } } : null;
    }
    case "kaart": {
      const lat = object?.lat;
      const lng = object?.lng;
      const mapScale = scale ?? object?.scale;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      if (mapScale !== "nederland" && mapScale !== "wereld") return null;
      return { type: "kaart", correct: { lat, lng, scale: mapScale } };
    }
    default:
      return null;
  }
}

type QuizScore = {
  played: boolean;
  /** Quiz total per team in twelfths, joker included (only when played). */
  points: Record<string, number>;
  jokerTeams: string[];
  playedRounds: Set<number>;
};

function scoreQuiz(input: ScoreboardInput, known: Set<string>): QuizScore {
  type Entry = { roundNo: number; question: Question | null; answers: Record<string, Answer>; overrides: Record<string, number> };
  const questions = new Map<string, Entry>();
  for (const row of input.quizAnswers) {
    if (!known.has(row.teamId)) continue;
    let entry = questions.get(row.questionId);
    if (!entry) {
      entry = { roundNo: row.roundNo, question: toQuestion(row.kind, row.correct, row.scale), answers: {}, overrides: {} };
      questions.set(row.questionId, entry);
    }
    entry.answers[row.teamId] = row.answer as Answer;
    if (row.overrideTwelfths !== null && Number.isFinite(row.overrideTwelfths)) entry.overrides[row.teamId] = row.overrideTwelfths;
  }

  const perRound = new Map<number, Record<string, number>>();
  for (const entry of questions.values()) {
    // The whole set of answers at once: an estimate is scored against the other teams.
    const scores = entry.question ? scoreQuestion(entry.question, entry.answers) : {};
    const round = perRound.get(entry.roundNo) ?? {};
    for (const team of Object.keys(entry.answers)) {
      const twelfths = Object.hasOwn(entry.overrides, team) ? entry.overrides[team] : (scores[team]?.twelfths ?? 0);
      round[team] = (round[team] ?? 0) + twelfths;
    }
    perRound.set(entry.roundNo, round);
  }

  const rounds = [...perRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, points]) => ({ round, points }));
  const jokerRounds: Record<string, number> = {};
  for (const joker of input.jokers) {
    if (joker.kind === "quiz" && joker.roundNo !== null && known.has(joker.teamId)) jokerRounds[joker.teamId] = joker.roundNo;
  }
  const totals = quizTotals(rounds, jokerRounds);
  const played = questions.size > 0;
  const playedRounds = new Set(perRound.keys());
  const points: Record<string, number> = {};
  if (played) for (const team of known) points[team] = totals[team]?.twelfths ?? 0;
  const jokerTeams = Object.entries(jokerRounds)
    .filter(([, round]) => playedRounds.has(round))
    .map(([team]) => team);
  return { played, points, jokerTeams, playedRounds };
}

/** Everything the scoreboard shows, worked out from the raw rows. Pure. */
export function assembleScoreboard(input: ScoreboardInput): Scoreboard {
  const teams = [...input.teams].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "nl"));
  const teamIds = teams.map((team) => team.id);
  const known = new Set(teamIds);
  const events = [...input.events].sort((a, b) => a.sort - b.sort);
  const quizEvent = events.find((event) => event.kind === "quiz");
  const intermezzoEvent = events.find((event) => event.kind === "intermezzo");
  const vrijdagEvent = events.find((event) => event.kind === "vrijdag");
  const games = events.filter((event) => event.kind === "zeskamp");

  const parts: Part[] = [];
  const scored: { event: ScoreEvent; part: Pick<Part, "id" | "name" | "short"> & { kind: PartKind } }[] = [];
  const zeskampPlaces: Record<string, GamePlacement[]> = {};

  // Quiz.
  const quiz = scoreQuiz(input, known);
  const quizPart: Part = {
    id: quizEvent?.id ?? "quiz",
    kind: "quiz",
    name: "Quiz",
    short: "Quiz",
    number: null,
    status: input.quizBusy ? "bezig" : quiz.played ? "klaar" : (quizEvent?.status ?? "gepland"),
    played: quiz.played,
    countsForMedals: quizEvent?.countsForMedals ?? true,
  };
  parts.push(quizPart);
  if (quiz.played) {
    scored.push({
      event: { id: quizPart.id, kind: "quiz", countsForMedals: quizPart.countsForMedals, points: quiz.points, jokerTeams: quiz.jokerTeams },
      part: quizPart,
    });
  }

  // Intermezzo: a fixed number of points per won duel, no joker and no medals.
  const duelPoints: Record<string, number> = {};
  for (const team of input.duelWinners) {
    if (team && known.has(team)) duelPoints[team] = (duelPoints[team] ?? 0) + input.intermezzoPoints * 12;
  }
  const intermezzoPlayed = input.duelWinners.length > 0;
  const intermezzoPart: Part = {
    id: intermezzoEvent?.id ?? "intermezzo",
    kind: "intermezzo",
    name: "Intermezzo",
    short: "Intermezzo",
    number: null,
    status: intermezzoPlayed ? (input.quizBusy ? "bezig" : "klaar") : (intermezzoEvent?.status ?? "gepland"),
    played: intermezzoPlayed,
    countsForMedals: false,
  };
  if (intermezzoPlayed) {
    parts.push(intermezzoPart);
    for (const team of teamIds) duelPoints[team] ??= 0;
    scored.push({ event: { id: intermezzoPart.id, kind: "intermezzo", countsForMedals: false, points: duelPoints }, part: intermezzoPart });
  }

  // Vrijdag: free points from the admin. Only teams with points take part in the medals.
  const vrijdagPoints: Record<string, number> = {};
  if (vrijdagEvent) {
    for (const row of input.results) {
      if (row.eventId === vrijdagEvent.id && row.freeTwelfths !== null && known.has(row.teamId)) {
        vrijdagPoints[row.teamId] = row.freeTwelfths;
      }
    }
  }
  const vrijdagPlayed = Object.keys(vrijdagPoints).length > 0;
  const vrijdagPart: Part = {
    id: vrijdagEvent?.id ?? "vrijdag",
    kind: "vrijdag",
    name: vrijdagEvent?.name ?? "Spelletjesmiddag",
    short: "Vrijdag",
    number: null,
    status: vrijdagPlayed ? "klaar" : (vrijdagEvent?.status ?? "gepland"),
    played: vrijdagPlayed,
    countsForMedals: vrijdagEvent?.countsForMedals ?? true,
  };
  parts.push(vrijdagPart);
  if (vrijdagPlayed) {
    scored.push({
      event: { id: vrijdagPart.id, kind: "vrijdag", countsForMedals: vrijdagPart.countsForMedals, points: vrijdagPoints },
      part: vrijdagPart,
    });
  }

  // Zeskamp: place points per game, medals on places, jokers doubled.
  games.forEach((game, index) => {
    const type = isResultType(game.resultType) ? game.resultType : null;
    const rows = input.results.filter((row) => row.eventId === game.id && row.rawValue !== null && known.has(row.teamId));
    const played = type !== null && rows.length > 0;
    const part: Part = {
      id: game.id,
      kind: "zeskamp",
      name: game.name,
      short: `Spel ${index + 1}`,
      number: index + 1,
      status: game.status,
      played,
      countsForMedals: game.countsForMedals,
    };
    parts.push(part);
    if (!played || type === null) return;
    const jokerTeams = game.jokerAllowed
      ? input.jokers.filter((joker) => joker.kind === "zeskamp" && joker.eventId === game.id && known.has(joker.teamId)).map((joker) => joker.teamId)
      : [];
    const values = teamIds.map((team) => ({ team, value: rows.find((row) => row.teamId === team)?.rawValue ?? null }));
    const placements = rankGame(values, type, game.pointsTable ?? input.zeskampPoints, jokerTeams);
    zeskampPlaces[game.id] = placements.map((row) => ({
      teamId: row.team,
      value: values.find((value) => value.team === row.team)?.value ?? null,
      place: row.place,
      shared: row.shared,
      twelfths: row.twelfths,
      joker: row.joker,
    }));
    scored.push({
      event: {
        id: game.id,
        kind: "zeskamp",
        countsForMedals: game.countsForMedals,
        points: Object.fromEntries(placements.map((row) => [row.team, row.twelfths])),
        places: Object.fromEntries(placements.map((row) => [row.team, row.place])),
        jokerTeams: placements.filter((row) => row.joker).map((row) => row.team),
      },
      part,
    });
  });

  // Bonus points: plus or minus, always with a reason.
  const bonus = input.bonus.filter((row) => known.has(row.teamId));
  if (bonus.length > 0) {
    const points: Record<string, number> = {};
    for (const row of bonus) points[row.teamId] = (points[row.teamId] ?? 0) + row.twelfths;
    scored.push({
      event: { id: "los", kind: "los", countsForMedals: false, points },
      part: { id: "los", kind: "los", name: "Losse punten", short: "Los" },
    });
  }

  const scoreEvents = scored.map((entry) => entry.event);
  const medalsPerEvent = scored.map((entry) => eventMedals(entry.event, teamIds));
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const standingRows: StandingRow[] = rankStandings(teamIds, scoreEvents).map((row) => ({
    team: teamById.get(row.team)!,
    place: row.place,
    shared: row.shared,
    twelfths: row.twelfths,
    breakdown: scored.flatMap((entry, index): BreakdownItem[] => {
      const reasons = entry.part.kind === "los" ? bonus.filter((b) => b.teamId === row.team) : [];
      if (entry.part.kind === "los" && reasons.length === 0) return [];
      const placement = zeskampPlaces[entry.part.id]?.find((p) => p.teamId === row.team);
      return [
        {
          partId: entry.part.id,
          kind: entry.part.kind,
          name: entry.part.name,
          short: entry.part.short,
          twelfths: row.breakdown[index]?.twelfths ?? 0,
          joker: row.breakdown[index]?.joker ?? false,
          place: placement?.place ?? null,
          shared: placement?.shared ?? false,
          medal: medalsPerEvent[index]?.[row.team] ?? null,
          reasons: reasons.map((b) => ({ id: b.id, reason: b.reason, twelfths: b.twelfths })),
        },
      ];
    }),
  }));

  const medalRows: MedalRow[] = medalTable(teamIds, scoreEvents).map((row) => ({
    team: teamById.get(row.team)!,
    gold: row.gold,
    silver: row.silver,
    bronze: row.bronze,
    place: row.place,
    shared: row.shared,
  }));

  const jokers: JokerInfo[] = [];
  for (const joker of input.jokers) {
    if (!known.has(joker.teamId)) continue;
    if (joker.kind === "quiz") {
      jokers.push({
        teamId: joker.teamId,
        kind: "quiz",
        partId: quizPart.id,
        partName: `Quiz, ronde ${joker.roundNo ?? "?"}`,
        label: `de quiz (ronde ${joker.roundNo ?? "?"})`,
        roundNo: joker.roundNo,
        used: joker.roundNo !== null && quiz.playedRounds.has(joker.roundNo),
      });
    } else {
      const part = parts.find((p) => p.id === joker.eventId);
      if (!part) continue;
      jokers.push({
        teamId: joker.teamId,
        kind: "zeskamp",
        partId: part.id,
        partName: `${part.short}: ${part.name}`,
        label: part.short.toLowerCase(),
        roundNo: null,
        used: part.status !== "gepland" || part.played,
      });
    }
  }
  jokers.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "quiz" ? -1 : 1) || a.partName.localeCompare(b.partName, "nl"));

  return {
    env: input.env,
    teams,
    parts,
    standings: standingRows,
    medals: medalRows,
    jokers,
    games: zeskampPlaces,
    bonus,
    empty: scored.length === 0,
  };
}

/* ------------------------------------------------------------------------ */
/* Loading                                                                   */
/* ------------------------------------------------------------------------ */

type EventDbRow = {
  id: string;
  kind: EventInfo["kind"];
  name: string;
  description: string | null;
  sort: number;
  result_type: string | null;
  unit: string | null;
  mode: GameMode;
  points_table: number[] | null;
  joker_allowed: boolean;
  counts_for_medals: boolean;
  status: GameStatus;
  started_at: Date | null;
  started_by: string | null;
  finished_at: Date | null;
};

export const EVENT_COLUMNS = [
  "id",
  "kind",
  "name",
  "description",
  "sort",
  "result_type",
  "unit",
  "mode",
  "points_table",
  "joker_allowed",
  "counts_for_medals",
  "status",
  "started_at",
  "started_by",
  "finished_at",
] as const;

export function toEventInfo(row: EventDbRow): EventInfo {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    sort: Number(row.sort),
    resultType: row.result_type,
    unit: row.unit,
    mode: row.mode,
    pointsTable: row.points_table ? row.points_table.map(Number) : null,
    jokerAllowed: row.joker_allowed,
    countsForMedals: row.counts_for_medals,
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    startedBy: row.started_by,
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

export async function readEvents(env: Env, sql: Sql = db()): Promise<EventInfo[]> {
  const rows = await sql<EventDbRow[]>`
    select ${sql(EVENT_COLUMNS)} from valk.events where env = ${env} order by sort, created_at
  `;
  return rows.map(toEventInfo);
}

/**
 * The quiz whose answers count: the one in the live state, or else the
 * quiz with the most answers in this environment. In the real Spelen the
 * demo quiz never counts.
 */
async function chooseQuiz(env: Env, sql: Sql, live: LiveState): Promise<string | null> {
  if (live.quizId) return live.quizId;
  const [row] = await sql<{ quiz_id: string }[]>`
    select r.quiz_id
    from valk.quiz_answers a
    join valk.quiz_questions q on q.id = a.question_id
    join valk.quiz_rounds r on r.id = q.round_id
    join valk.quizzes z on z.id = r.quiz_id
    where a.env = ${env} and (${env} = 'test' or not z.is_demo)
    group by r.quiz_id
    order by count(*) desc, r.quiz_id
    limit 1
  `;
  return row?.quiz_id ?? null;
}

export async function loadScoreboardInput(
  env: Env,
  sql: Sql,
  live: LiveState,
  settings: { zeskampPoints: number[]; intermezzoPoints: number },
): Promise<ScoreboardInput> {
  const quizId = await chooseQuiz(env, sql, live);
  // The current question only counts once it is revealed.
  const openQuestion = live.questionId && (live.phase === "open" || live.phase === "gesloten") ? live.questionId : null;
  const [teams, events, results, jokers, bonus, duels, answers] = await Promise.all([
    sql<{ id: string; name: string; color: TeamColor; sort: number }[]>`
      select id, name, color, sort from valk.teams where env = ${env} order by sort, name
    `,
    readEvents(env, sql),
    sql<
      {
        event_id: string;
        team_id: string;
        raw_value: number | null;
        free_twelfths: number | null;
        entered_by: string;
        entered_at: Date;
        client_id: string | null;
      }[]
    >`
      select event_id, team_id, raw_value, free_twelfths, entered_by, entered_at, client_id
      from valk.event_results where env = ${env}
    `,
    sql<{ team_id: string; kind: "quiz" | "zeskamp"; round_no: number | null; event_id: string | null; set_at: Date; set_by: string }[]>`
      select team_id, kind, round_no, event_id, set_at, set_by from valk.jokers where env = ${env}
    `,
    sql<{ id: string; team_id: string; twelfths: number; reason: string; given_by: string; created_at: Date }[]>`
      select id, team_id, twelfths, reason, given_by, created_at from valk.bonus_points
      where env = ${env} order by created_at, id
    `,
    sql<{ team_id: string | null }[]>`
      select p.team_id
      from valk.duels d left join valk.participants p on p.id = d.winner_id
      where d.env = ${env} and d.status = 'klaar' and d.winner_id is not null
    `,
    quizId
      ? sql<
          {
            question_id: string;
            team_id: string;
            round_no: number;
            kind: string;
            correct: unknown;
            scale: string | null;
            answer: unknown;
            override_twelfths: number | null;
          }[]
        >`
          select a.question_id, a.team_id, r.number as round_no, q.kind, q.correct, q.scale, a.answer, a.override_twelfths
          from valk.quiz_answers a
          join valk.quiz_questions q on q.id = a.question_id
          join valk.quiz_rounds r on r.id = q.round_id
          where a.env = ${env} and r.quiz_id = ${quizId}
        `
      : Promise.resolve([]),
  ]);

  return {
    env,
    teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color, sort: Number(t.sort) })),
    events,
    results: results.map((r) => ({
      eventId: r.event_id,
      teamId: r.team_id,
      rawValue: r.raw_value === null ? null : Number(r.raw_value),
      freeTwelfths: r.free_twelfths === null ? null : Number(r.free_twelfths),
      enteredBy: r.entered_by,
      enteredAt: r.entered_at.toISOString(),
      clientId: r.client_id,
    })),
    jokers: jokers.map((j) => ({
      teamId: j.team_id,
      kind: j.kind,
      roundNo: j.round_no === null ? null : Number(j.round_no),
      eventId: j.event_id,
      setAt: j.set_at.toISOString(),
      setBy: j.set_by,
    })),
    bonus: bonus.map((b) => ({
      id: b.id,
      teamId: b.team_id,
      twelfths: Number(b.twelfths),
      reason: b.reason,
      givenBy: b.given_by,
      createdAt: b.created_at.toISOString(),
    })),
    quizAnswers: answers
      .filter((a) => a.question_id !== openQuestion)
      .map((a) => ({
        questionId: a.question_id,
        teamId: a.team_id,
        roundNo: Number(a.round_no),
        kind: a.kind,
        correct: a.correct,
        scale: a.scale,
        answer: a.answer,
        overrideTwelfths: a.override_twelfths === null ? null : Number(a.override_twelfths),
      })),
    duelWinners: duels.map((d) => d.team_id),
    zeskampPoints: settings.zeskampPoints,
    intermezzoPoints: settings.intermezzoPoints,
    quizBusy: live.mode === "quiz" || live.mode === "intermezzo",
  };
}

/** A short memory per environment: many phones ask at once, the answer only changes with the version. */
const cache = new Map<Env, { key: string; at: number; board: Scoreboard }>();
const CACHE_MS = 15_000;

/** The full, current scoreboard (for the admin, the ceremony and the snapshot). */
export async function getScoreboard(env: Env, live?: LiveState): Promise<Scoreboard> {
  const state = live ?? (await readLiveState(env));
  const settings = await getSettings();
  const key = [state.version, state.mode, state.questionId, state.phase, settings.updatedAt].join("|");
  const hit = cache.get(env);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_MS) return hit.board;
  const board = assembleScoreboard(await loadScoreboardInput(env, db(), state, settings));
  cache.set(env, { key, at: Date.now(), board });
  return board;
}

/* ------------------------------------------------------------------------ */
/* Views: what each role may see                                             */
/* ------------------------------------------------------------------------ */

export type TeamView = { id: string; name: string; color: TeamColor };

export type ViewBreakdown = {
  partId: string;
  kind: PartKind;
  name: string;
  short: string;
  twelfths: number | null;
  joker: boolean;
  place: number | null;
  shared: boolean;
  medal: Medal | null;
  reasons: { reason: string; twelfths: number | null }[];
};

export type ViewStanding = {
  team: TeamView;
  place: number | null;
  shared: boolean;
  twelfths: number | null;
  /** "Quiz 41 met joker, vrijdag 5" (empty in the surprise view). */
  summary: string;
  breakdown: ViewBreakdown[];
};

export type ViewMedal = {
  team: TeamView;
  gold: number | null;
  silver: number | null;
  bronze: number | null;
  place: number | null;
  shared: boolean;
};

export type ViewPart = { id: string; kind: Part["kind"]; name: string; short: string; status: GameStatus; played: boolean };

export type ViewJoker = { team: TeamView; kind: "quiz" | "zeskamp"; partName: string; label: string; used: boolean };

export type ScoreView = {
  /** live: the real numbers; momentopname: the snapshot of the lock; verrast: no numbers at all. */
  show: "live" | "momentopname" | "verrast";
  locked: boolean;
  lockedAt: string | null;
  /** When the snapshot that is shown was taken. */
  takenAt: string | null;
  standings: ViewStanding[];
  medals: ViewMedal[];
  parts: ViewPart[];
  jokers: ViewJoker[];
  /** Teams on top of the medal table (when there are medals). */
  medalLeaders: TeamView[];
  empty: boolean;
};

export function teamView(team: TeamInfo | TeamView): TeamView {
  return { id: team.id, name: team.name, color: team.color };
}

/** "Quiz 41 met joker, vrijdag 5, zeskamp 52". Labels and numbers never part over two lines. */
export function summaryLine(items: readonly Pick<BreakdownItem, "kind" | "twelfths" | "joker">[]): string {
  const label: Record<PartKind, string> = {
    quiz: "quiz",
    intermezzo: "intermezzo",
    vrijdag: "vrijdag",
    zeskamp: "zeskamp",
    los: `losse${NBSP}punten`,
  };
  const pieces: string[] = [];
  let zeskampDone = false;
  for (const item of items) {
    if (item.kind === "zeskamp") {
      if (zeskampDone) continue;
      zeskampDone = true;
      const games = items.filter((i) => i.kind === "zeskamp");
      const sum = games.reduce((total, game) => total + game.twelfths, 0);
      const joker = games.some((game) => game.joker) ? `${NBSP}met${NBSP}joker` : "";
      pieces.push(`zeskamp${NBSP}${formatPoints(sum)}${joker}`);
      continue;
    }
    const joker = item.joker ? `${NBSP}met${NBSP}joker` : "";
    pieces.push(`${label[item.kind]}${NBSP}${formatPoints(item.twelfths)}${joker}`);
  }
  const text = pieces.join(", ");
  return text ? bijElkaar(text.charAt(0).toUpperCase() + text.slice(1)) : "";
}

function viewParts(board: Scoreboard): ViewPart[] {
  return board.parts.map((part) => ({
    id: part.id,
    kind: part.kind,
    name: part.name,
    short: part.short,
    status: part.status,
    played: part.played,
  }));
}

function viewJokers(board: Scoreboard, all: boolean): ViewJoker[] {
  const teams = new Map(board.teams.map((team) => [team.id, team]));
  return board.jokers
    .filter((joker) => all || joker.used)
    .flatMap((joker) => {
      const team = teams.get(joker.teamId);
      return team
        ? [{ team: teamView(team), kind: joker.kind, partName: joker.partName, label: joker.label, used: joker.used }]
        : [];
    });
}

function leaders(medals: readonly ViewMedal[]): TeamView[] {
  const any = medals.some((row) => (row.gold ?? 0) + (row.silver ?? 0) + (row.bronze ?? 0) > 0);
  return any ? medals.filter((row) => row.place === 1).map((row) => row.team) : [];
}

/** The real numbers: for the admin, and for everyone while the lock is open. */
export function liveView(board: Scoreboard, live: Pick<LiveState, "lockClosed" | "lockClosedAt">, allJokers: boolean): ScoreView {
  const medals: ViewMedal[] = board.medals.map((row) => ({
    team: teamView(row.team),
    gold: row.gold,
    silver: row.silver,
    bronze: row.bronze,
    place: row.place,
    shared: row.shared,
  }));
  return {
    show: "live",
    locked: live.lockClosed,
    lockedAt: live.lockClosedAt,
    takenAt: null,
    standings: board.standings.map((row) => ({
      team: teamView(row.team),
      place: row.place,
      shared: row.shared,
      twelfths: row.twelfths,
      summary: summaryLine(row.breakdown),
      breakdown: row.breakdown.map((item) => ({
        partId: item.partId,
        kind: item.kind,
        name: item.name,
        short: item.short,
        twelfths: item.twelfths,
        joker: item.joker,
        place: item.place,
        shared: item.shared,
        medal: item.medal,
        reasons: item.reasons.map((reason) => ({ reason: reason.reason, twelfths: reason.twelfths })),
      })),
    })),
    medals,
    parts: viewParts(board),
    jokers: viewJokers(board, allJokers),
    medalLeaders: leaders(medals),
    empty: board.empty,
  };
}

/** "Ik wil zelf ook verrast worden": the admin sees what happened, but no points or places. */
export function surpriseView(board: Scoreboard, live: Pick<LiveState, "lockClosed" | "lockClosedAt">): ScoreView {
  const byTeamOrder = (a: { team: TeamInfo }, b: { team: TeamInfo }) => a.team.sort - b.team.sort;
  return {
    show: "verrast",
    locked: live.lockClosed,
    lockedAt: live.lockClosedAt,
    takenAt: null,
    standings: [...board.standings].sort(byTeamOrder).map((row) => ({
      team: teamView(row.team),
      place: null,
      shared: false,
      twelfths: null,
      summary: "",
      breakdown: row.breakdown.map((item) => ({
        partId: item.partId,
        kind: item.kind,
        name: item.name,
        short: item.short,
        twelfths: null,
        joker: item.joker,
        place: null,
        shared: false,
        medal: null,
        reasons: item.reasons.map((reason) => ({ reason: reason.reason, twelfths: null })),
      })),
    })),
    medals: [...board.medals].sort(byTeamOrder).map((row) => ({
      team: teamView(row.team),
      gold: null,
      silver: null,
      bronze: null,
      place: null,
      shared: false,
    })),
    parts: viewParts(board),
    jokers: viewJokers(board, true),
    medalLeaders: [],
    empty: board.empty,
  };
}

export type Snapshot = {
  takenAt: string;
  standings: ViewStanding[];
  medals: ViewMedal[];
  parts: ViewPart[];
  jokers: ViewJoker[];
};

/**
 * While the lock is closed (SPEC §5.3): the snapshot of the moment it
 * closed, plus which parts are played now and the jokers used, never a
 * point scored after the lock.
 */
export function lockedView(board: Scoreboard, live: Pick<LiveState, "lockClosed" | "lockClosedAt">, snapshot: Snapshot | null): ScoreView {
  if (!snapshot) {
    // Without a snapshot there is nothing safe to show: names only.
    return { ...surpriseView(board, live), show: "momentopname", jokers: viewJokers(board, false) };
  }
  return {
    show: "momentopname",
    locked: true,
    lockedAt: live.lockClosedAt,
    takenAt: snapshot.takenAt,
    standings: snapshot.standings,
    medals: snapshot.medals,
    parts: viewParts(board),
    jokers: viewJokers(board, false),
    medalLeaders: leaders(snapshot.medals),
    empty: snapshot.standings.every((row) => row.breakdown.length === 0),
  };
}

export async function latestSnapshot(env: Env, sql: Sql = db()): Promise<Snapshot | null> {
  const [row] = await sql<{ taken_at: Date; standings: unknown; medals: unknown; events: unknown; jokers: unknown }[]>`
    select taken_at, standings, medals, events, jokers from valk.scoreboard_snapshots
    where env = ${env} order by taken_at desc, id desc limit 1
  `;
  if (!row) return null;
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    takenAt: row.taken_at.toISOString(),
    standings: list<ViewStanding>(row.standings),
    medals: list<ViewMedal>(row.medals),
    parts: list<ViewPart>(row.events),
    jokers: list<ViewJoker>(row.jokers),
  };
}

/** Per device: the admin who wants to be surprised too. */
export const VERRAST_COOKIE = "valk_verrast";

export async function adminWantsSurprise(): Promise<boolean> {
  const store = await cookies();
  return store.get(VERRAST_COOKIE)?.value === "1";
}

/**
 * The admin sees results behind the lock, unless he views the app as
 * someone else or wants to be surprised too (then he sees what the family
 * sees, on every screen).
 */
export async function seesEverything(ctx: { isAdmin: boolean; viewAs: unknown }): Promise<boolean> {
  return ctx.isAdmin && !ctx.viewAs && !(await adminWantsSurprise());
}

export type Viewer = { admin: boolean; surprise: boolean };

/** The scoreboard as this viewer may see it. */
export async function scoreViewFor(env: Env, viewer: Viewer): Promise<ScoreView> {
  const live = await readLiveState(env);
  const board = await getScoreboard(env, live);
  if (viewer.admin) return viewer.surprise ? surpriseView(board, live) : liveView(board, live, true);
  if (live.lockClosed) return lockedView(board, live, await latestSnapshot(env));
  return liveView(board, live, false);
}

/* ------------------------------------------------------------------------ */
/* The lock (SPEC §4.5 "Slot" and §5.3)                                      */
/* ------------------------------------------------------------------------ */

/**
 * Close the lock and save a snapshot of the standings, the medal table,
 * the parts and the jokers. Call it inside the transaction that starts a
 * game, before anything of that game is written. `disarm` turns off the
 * automatic lock (it closes once, at the first game).
 */
export async function closeLock(
  env: Env,
  sql: postgres.TransactionSql,
  actor: Actor,
  reason: string,
  options: { disarm?: boolean } = {},
): Promise<boolean> {
  const live = await lockLiveState(env, asPool(sql));
  if (live.lockClosed) return false;
  const settings = await readSettings();
  const board = assembleScoreboard(await loadScoreboardInput(env, sql, live, settings));
  const view = liveView(board, live, false);
  const [snapshot] = await sql<{ taken_at: Date }[]>`
    insert into valk.scoreboard_snapshots (env, standings, medals, events, jokers)
    values (
      ${env},
      ${sql.json(view.standings as unknown as postgres.JSONValue)},
      ${sql.json(view.medals as unknown as postgres.JSONValue)},
      ${sql.json(view.parts as unknown as postgres.JSONValue)},
      ${sql.json(view.jokers as unknown as postgres.JSONValue)}
    )
    returning taken_at
  `;
  await sql`
    update valk.live_state set
      lock_closed = true,
      lock_closed_at = ${snapshot.taken_at},
      lock_auto = ${options.disarm ? false : live.lockAuto},
      updated_at = now()
    where env = ${env}
  `;
  await logAudit(actor, { action: "slot.dicht", entity: "slot", newValue: { reden: reason } }, sql, env);
  return true;
}

/** Open the lock: only through the reveal at the ceremony, or the admin's override. */
export async function openLock(env: Env, sql: postgres.TransactionSql, actor: Actor, reason: string): Promise<boolean> {
  const live = await lockLiveState(env, asPool(sql));
  if (!live.lockClosed) return false;
  await sql`update valk.live_state set lock_closed = false, updated_at = now() where env = ${env}`;
  await logAudit(actor, { action: "slot.open", entity: "slot", newValue: { reden: reason } }, sql, env);
  return true;
}

/** Close at the start of a game when the automatic lock is armed (and disarm it). */
export async function closeLockIfAuto(env: Env, sql: postgres.TransactionSql, actor: Actor, reason: string): Promise<boolean> {
  const live = await lockLiveState(env, asPool(sql));
  if (!live.lockAuto || live.lockClosed) return false;
  return closeLock(env, sql, actor, reason, { disarm: true });
}

export async function setLockClosed(env: Env, closed: boolean, actor: Actor): Promise<boolean> {
  return db().begin((sql) =>
    closed
      ? closeLock(env, sql, actor, "met de hand dichtgezet door de beheerder")
      : openLock(env, sql, actor, "met de hand geopend door de beheerder"),
  );
}

export async function setLockAuto(env: Env, value: boolean, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const live = await lockLiveState(env, asPool(sql));
    if (live.lockAuto === value) return;
    await sql`update valk.live_state set lock_auto = ${value}, updated_at = now() where env = ${env}`;
    await logAudit(actor, { action: "slot.automatisch", entity: "slot", oldValue: { aan: live.lockAuto }, newValue: { aan: value } }, sql, env);
  });
}

/* ------------------------------------------------------------------------ */
/* Bonus points                                                              */
/* ------------------------------------------------------------------------ */

export async function addBonus(env: Env, input: { teamId: string; twelfths: number; reason: string }, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [team] = await sql<{ name: string }[]>`select name from valk.teams where env = ${env} and id = ${input.teamId}`;
    if (!team) throw new Error("Dit team bestaat niet meer.");
    const [row] = await sql<{ id: string }[]>`
      insert into valk.bonus_points (env, team_id, twelfths, reason, given_by)
      values (${env}, ${input.teamId}, ${input.twelfths}, ${input.reason}, ${actor.name})
      returning id
    `;
    await logAudit(
      actor,
      {
        action: "punten.los",
        entity: "losse punten",
        entityId: row.id,
        newValue: { team: team.name, punten: formatPoints(input.twelfths), reden: input.reason },
      },
      sql,
      env,
    );
  });
}

/** Undo bonus points; the logbook keeps what they were. */
export async function removeBonus(env: Env, id: string, actor: Actor): Promise<boolean> {
  return db().begin(async (sql) => {
    const [row] = await sql<{ twelfths: number; reason: string; name: string }[]>`
      delete from valk.bonus_points b using valk.teams t
      where b.env = ${env} and b.id = ${id} and t.id = b.team_id
      returning b.twelfths, b.reason, t.name
    `;
    if (!row) return false;
    await logAudit(
      actor,
      {
        action: "punten.los.verwijderd",
        entity: "losse punten",
        entityId: id,
        oldValue: { team: row.name, punten: formatPoints(Number(row.twelfths)), reden: row.reason },
      },
      sql,
      env,
    );
    return true;
  });
}

/* ------------------------------------------------------------------------ */
/* Sample results for the test environment ("Zet de proef klaar")           */
/* ------------------------------------------------------------------------ */

/** A raw value that ranks `rank` (0 is best) for each result type. */
function sampleValue(type: string, rank: number): number {
  const table: Record<string, number[]> = {
    tijd: [41.2, 43.05, 44.87, 52.1],
    aantal_hoog: [14, 11, 9, 6],
    aantal_laag: [2, 4, 7, 9],
    meting_hoog: [142, 120, 97, 80],
    meting_laag: [12, 18, 25, 40],
    plaatsen: [1, 2, 3, 4],
    jury: [9, 8, 7, 5],
  };
  const values = table[type] ?? table.plaatsen;
  return values[Math.min(rank, values.length - 1)];
}

/**
 * Vrijdag points, the first two zeskamp games with a joker, and one bonus,
 * so the test scoreboard is not empty. The lock stays open and armed: the
 * next game that starts in the test closes it, as on the real Saturday.
 */
export async function seedSampleScores(sql: postgres.TransactionSql): Promise<void> {
  const teams = await sql<{ id: string }[]>`select id from valk.teams where env = 'test' order by sort, name`;
  if (teams.length === 0) return;
  const events = await readEvents("test", sql);
  const vrijdag = events.find((event) => event.kind === "vrijdag");
  const games = events.filter((event) => event.kind === "zeskamp");
  const by = "Voorbeeld";

  if (vrijdag) {
    const points = [8, 5, 10, 6];
    for (const [index, team] of teams.entries()) {
      await sql`
        insert into valk.event_results (env, event_id, team_id, free_twelfths, entered_by)
        values ('test', ${vrijdag.id}, ${team.id}, ${(points[index] ?? 4) * 12}, ${by})
      `;
    }
    await sql`update valk.events set status = 'klaar', finished_at = now() where id = ${vrijdag.id}`;
  }

  // The order in which the teams finish, best first, as indexes into `teams`.
  const orders = [
    [3, 1, 0, 2],
    [0, 2, 1, 3],
  ];
  for (const [gameIndex, game] of games.slice(0, 2).entries()) {
    if (!isResultType(game.resultType)) continue;
    const order = orders[gameIndex];
    for (const [rank, teamIndex] of order.entries()) {
      const team = teams[teamIndex];
      if (!team) continue;
      await sql`
        insert into valk.event_results (env, event_id, team_id, raw_value, entered_by, client_id)
        values ('test', ${game.id}, ${team.id}, ${sampleValue(game.resultType, rank)}, ${by}, ${`voorbeeld-${gameIndex}`})
      `;
    }
    await sql`
      update valk.events set status = 'klaar', started_at = now() - interval '2 hours', started_by = ${by},
        finished_at = now() - interval '100 minutes'
      where id = ${game.id}
    `;
    const jokerTeam = teams[order[0]];
    if (game.jokerAllowed && jokerTeam && gameIndex === 0) {
      await sql`
        insert into valk.jokers (env, team_id, kind, event_id, set_by)
        values ('test', ${jokerTeam.id}, 'zeskamp', ${game.id}, ${by})
        on conflict (env, team_id, kind) do nothing
      `;
    }
  }

  const bonusTeam = teams[2];
  if (bonusTeam) {
    await sql`
      insert into valk.bonus_points (env, team_id, twelfths, reason, given_by)
      values ('test', ${bonusTeam.id}, 12, 'Mooiste teamyel van de proef', ${by})
    `;
  }
  await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = 'test'`;
}
