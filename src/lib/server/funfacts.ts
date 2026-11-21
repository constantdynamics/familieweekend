import "server-only";
import { deflateSync } from "node:zlib";
import { cacheLife, cacheTag } from "next/cache";
import type postgres from "postgres";
import type { Sql, TransactionSql } from "postgres";
import {
  conceptQuestion,
  fileSlug,
  optionRenames,
  uploadIdOf,
  type AnswerShape,
  type ConceptResult,
  type FunfactKind,
  type FunfactValue,
  type QuestionShape,
} from "@/lib/shared/funfacts";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { SETTINGS_TAG } from "./settings";
import { isUuid } from "./teams";
import type { Env } from "./tokens";
import { crc32 } from "./zip";

/**
 * Fun facts (SPEC §4.2, §4.11 and §9.1). The questions are the same for the
 * real Spelen and the test environment; answers belong to a participant, so
 * they follow the environment of that name. Answers and photos are only for
 * the admin and the person themself: every function here that returns
 * answers is called after that check.
 */

export const FUNFACTS_TAG = "funfacts";

/** A connection or a transaction. */
type Query = Sql | TransactionSql;

/** A refusal with a Dutch message that can go straight to the screen. */
export class FunfactError extends Error {}

export type FunfactQuestion = QuestionShape & {
  sort: number;
  hint: string | null;
  active: boolean;
};

type QuestionRow = {
  id: string;
  sort: number;
  kind: FunfactKind;
  text: string;
  hint: string | null;
  options: unknown;
  min_value: number | null;
  max_value: number | null;
  quiz_form: string | null;
  active: boolean;
};

function toQuestion(row: QuestionRow): FunfactQuestion {
  return {
    id: row.id,
    sort: row.sort,
    kind: row.kind,
    text: row.text,
    hint: row.hint,
    options: Array.isArray(row.options) ? row.options.filter((o): o is string => typeof o === "string") : null,
    min: row.min_value === null ? null : Number(row.min_value),
    max: row.max_value === null ? null : Number(row.max_value),
    quizForm: row.quiz_form,
    active: row.active,
  };
}

/** Only the shapes the app writes; anything else reads as "no value". */
function toValue(raw: unknown): FunfactValue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.bool === "boolean") return { bool: value.bool };
  if (typeof value.number === "number") return { number: value.number };
  if (typeof value.choice === "string") return { choice: value.choice };
  if (typeof value.text === "string") return { text: value.text };
  if (typeof value.upload === "string") return { upload: value.upload };
  return null;
}

export async function listFunfactQuestions(options: { activeOnly?: boolean } = {}, sql: Query = db()): Promise<FunfactQuestion[]> {
  const rows = await sql<QuestionRow[]>`
    select id, sort, kind, text, hint, options, min_value, max_value, quiz_form, active
    from valk.funfact_questions
    ${options.activeOnly ? sql`where active` : sql``}
    order by sort, created_at
  `;
  return rows.map(toQuestion);
}

export async function getFunfactQuestion(id: string, sql: Query = db()): Promise<FunfactQuestion | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<QuestionRow[]>`
    select id, sort, kind, text, hint, options, min_value, max_value, quiz_form, active
    from valk.funfact_questions where id = ${id}
  `;
  return row ? toQuestion(row) : null;
}

/* ------------------------------------------------------------------------ */
/* Answers of one person                                                     */
/* ------------------------------------------------------------------------ */

export type StoredAnswer = AnswerShape & { questionId: string; updatedAt: string };

type AnswerRow = { participant_id: string; question_id: string; value: unknown; skipped: boolean; updated_at: Date };

function toAnswer(row: AnswerRow): StoredAnswer {
  return { questionId: row.question_id, value: toValue(row.value), skipped: row.skipped, updatedAt: row.updated_at.toISOString() };
}

/** The answers of one person. Call only for the person themself or the admin. */
export async function answersForParticipant(participantId: string): Promise<StoredAnswer[]> {
  if (!isUuid(participantId)) return [];
  const rows = await db()<AnswerRow[]>`
    select participant_id, question_id, value, skipped, updated_at
    from valk.funfact_answers where participant_id = ${participantId}
  `;
  return rows.map(toAnswer);
}

/** How far the names on one device are: answered or skipped active questions. */
export async function progressForParticipants(env: Env, ids: string[]): Promise<Map<string, number>> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return new Map();
  const sql = db();
  const rows = await sql<{ participant_id: string; done: number }[]>`
    select a.participant_id, count(*)::int as done
    from valk.funfact_answers a
    join valk.funfact_questions q on q.id = a.question_id and q.active
    join valk.participants p on p.id = a.participant_id and p.env = ${env}
    where a.participant_id in ${sql(valid)}
    group by a.participant_id
  `;
  return new Map(rows.map((r) => [r.participant_id, r.done]));
}

export type SaveResult = { done: boolean; becameDone: boolean };

/**
 * Save one answer (or a skip) for one person. The caller has checked that
 * the name belongs to this device and that the list is open. A photo answer
 * must point at a fun-fact photo this person uploaded; a photo that is
 * replaced or skipped is deleted right away. When every active question has
 * an answer or a skip, the person is done.
 */
export async function saveFunfactAnswer(
  env: Env,
  participantId: string,
  questionId: string,
  value: FunfactValue | null,
  skipped: boolean,
): Promise<SaveResult> {
  return db().begin(async (sql) => {
    const [person] = await sql<{ funfacts_done_at: Date | null }[]>`
      select funfacts_done_at from valk.participants where env = ${env} and id = ${participantId} for update
    `;
    if (!person) throw new FunfactError("Deze naam staat niet meer in de lijst. Kies je naam opnieuw.");
    const [previous] = await sql<{ value: unknown }[]>`
      select value from valk.funfact_answers
      where participant_id = ${participantId} and question_id = ${questionId}
      for update
    `;
    const upload = uploadIdOf(value);
    if (upload) {
      const [own] = await sql<{ id: string }[]>`
        select id from valk.uploads where id = ${upload} and kind = 'funfact' and participant_id = ${participantId}
      `;
      if (!own) throw new FunfactError("Deze foto kwam niet goed aan. Kies hem nog een keer.");
    }
    await sql`
      insert into valk.funfact_answers (participant_id, question_id, value, skipped, updated_at)
      values (
        ${participantId}, ${questionId},
        ${value === null ? null : sql.json(value as postgres.JSONValue)}, ${skipped}, now()
      )
      on conflict (participant_id, question_id)
      do update set value = excluded.value, skipped = excluded.skipped, updated_at = now()
    `;
    const oldUpload = uploadIdOf(previous?.value);
    if (oldUpload && oldUpload !== upload) {
      await sql`delete from valk.uploads where id = ${oldUpload} and kind = 'funfact' and participant_id = ${participantId}`;
    }
    if (person.funfacts_done_at) return { done: true, becameDone: false };
    const [{ missing }] = await sql<{ missing: number }[]>`
      select count(*)::int as missing
      from valk.funfact_questions q
      where q.active and not exists (
        select 1 from valk.funfact_answers a where a.participant_id = ${participantId} and a.question_id = q.id
      )
    `;
    if (missing > 0) return { done: false, becameDone: false };
    await sql`update valk.participants set funfacts_done_at = now(), updated_at = now() where id = ${participantId}`;
    return { done: true, becameDone: true };
  });
}

/* ------------------------------------------------------------------------ */
/* The counter on Thuis                                                      */
/* ------------------------------------------------------------------------ */

export type FunfactsCount = { done: number; total: number };

export async function countFunfactsDone(env: Env): Promise<FunfactsCount> {
  const [row] = await db()<{ done: number; total: number }[]>`
    select count(funfacts_done_at)::int as done, count(*)::int as total
    from valk.participants where env = ${env}
  `;
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}

/**
 * "32 van de 45 familieleden zijn klaar" for Thuis (the real Spelen).
 * Cached; refreshed when someone finishes and with the daily keepalive.
 */
export async function getFunfactsCount(): Promise<FunfactsCount> {
  "use cache";
  cacheTag(FUNFACTS_TAG, SETTINGS_TAG);
  cacheLife("minutes");
  return countFunfactsDone("live");
}

/* ------------------------------------------------------------------------ */
/* Admin: progress, all answers                                              */
/* ------------------------------------------------------------------------ */

export type FunfactProgress = {
  id: string;
  name: string;
  nickname: string | null;
  teamId: string | null;
  claimed: boolean;
  doneAt: string | null;
  answered: number;
  skipped: number;
};

export async function listProgress(env: Env): Promise<FunfactProgress[]> {
  const rows = await db()<
    {
      id: string;
      name: string;
      nickname: string | null;
      team_id: string | null;
      claimed: boolean;
      funfacts_done_at: Date | null;
      answered: number;
      skipped: number;
    }[]
  >`
    select p.id, p.name, p.nickname, p.team_id, p.claimed_device_id is not null as claimed, p.funfacts_done_at,
      count(a.question_id) filter (where q.active and not a.skipped and a.value is not null)::int as answered,
      count(a.question_id) filter (where q.active and a.skipped)::int as skipped
    from valk.participants p
    left join valk.funfact_answers a on a.participant_id = p.id
    left join valk.funfact_questions q on q.id = a.question_id
    where p.env = ${env}
    group by p.id
    order by lower(p.name)
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nickname: r.nickname,
    teamId: r.team_id,
    claimed: r.claimed,
    doneAt: r.funfacts_done_at?.toISOString() ?? null,
    answered: r.answered,
    skipped: r.skipped,
  }));
}

export type AnswerOfPerson = StoredAnswer & { participantId: string };

/** Every answer in this environment (admin only). */
export async function listAllAnswers(env: Env): Promise<AnswerOfPerson[]> {
  const rows = await db()<AnswerRow[]>`
    select a.participant_id, a.question_id, a.value, a.skipped, a.updated_at
    from valk.funfact_answers a
    join valk.participants p on p.id = a.participant_id
    where p.env = ${env}
  `;
  return rows.map((row) => ({ ...toAnswer(row), participantId: row.participant_id }));
}

/** The draft quiz question of one fun fact, from the answers in this environment. */
export async function conceptFor(env: Env, question: FunfactQuestion): Promise<ConceptResult> {
  const rows = await db()<AnswerRow[]>`
    select a.participant_id, a.question_id, a.value, a.skipped, a.updated_at
    from valk.funfact_answers a
    join valk.participants p on p.id = a.participant_id
    where p.env = ${env} and a.question_id = ${question.id}
  `;
  return conceptQuestion(question, rows.map(toAnswer));
}

/* ------------------------------------------------------------------------ */
/* Admin: questions                                                          */
/* ------------------------------------------------------------------------ */

export type QuestionInput = {
  kind: FunfactKind;
  text: string;
  hint: string | null;
  options: string[] | null;
  min: number | null;
  max: number | null;
  quizForm: string | null;
  active: boolean;
};

function auditView(q: QuestionInput | FunfactQuestion) {
  return {
    soort: q.kind,
    vraag: q.text,
    uitleg: q.hint,
    opties: q.options,
    min: q.min,
    max: q.max,
    quizvorm: q.quizForm,
    actief: q.active,
  };
}

async function answerCount(sql: Query, questionId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from valk.funfact_answers where question_id = ${questionId}`;
  return row?.n ?? 0;
}

export async function hasAnswers(questionId: string): Promise<boolean> {
  return (await answerCount(db(), questionId)) > 0;
}

/** Change a question. The kind is fixed once there are answers; renamed options take their answers along. */
export async function updateFunfactQuestion(env: Env, id: string, input: QuestionInput, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<QuestionRow[]>`
      select id, sort, kind, text, hint, options, min_value, max_value, quiz_form, active
      from valk.funfact_questions where id = ${id} for update
    `;
    if (!row) throw new FunfactError("Deze vraag bestaat niet meer.");
    const before = toQuestion(row);
    if (before.kind !== input.kind && (await answerCount(sql, id)) > 0) {
      throw new FunfactError("Er zijn al antwoorden op deze vraag, dus de soort ligt vast. Maak anders een nieuwe vraag.");
    }
    await sql`
      update valk.funfact_questions set
        kind = ${input.kind}, text = ${input.text}, hint = ${input.hint},
        options = ${input.options ? sql.json(input.options) : null},
        min_value = ${input.min}, max_value = ${input.max}, quiz_form = ${input.quizForm},
        active = ${input.active}, updated_at = now()
      where id = ${id}
    `;
    if (before.kind === "keuze" && input.kind === "keuze") {
      for (const [oud, nieuw] of optionRenames(before.options ?? [], input.options ?? [])) {
        await sql`
          update valk.funfact_answers set value = ${sql.json({ choice: nieuw })}, updated_at = now()
          where question_id = ${id} and value ->> 'choice' = ${oud}
        `;
      }
    }
    await logAudit(
      actor,
      { action: "funfacts.vraag", entity: "funfactvraag", entityId: id, oldValue: auditView(before), newValue: auditView(input) },
      sql,
      env,
    );
  });
}

export async function addFunfactQuestion(env: Env, input: QuestionInput, actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext('valk.funfact_questions.sort'))`;
    const [row] = await sql<{ id: string }[]>`
      insert into valk.funfact_questions (sort, kind, text, hint, options, min_value, max_value, quiz_form, active)
      values (
        (select coalesce(max(sort), 0) + 1 from valk.funfact_questions),
        ${input.kind}, ${input.text}, ${input.hint}, ${input.options ? sql.json(input.options) : null},
        ${input.min}, ${input.max}, ${input.quizForm}, ${input.active}
      )
      returning id
    `;
    await logAudit(actor, { action: "funfacts.vraag.toegevoegd", entity: "funfactvraag", entityId: row.id, newValue: auditView(input) }, sql, env);
    return row.id;
  });
}

/** Only a question without answers can go; otherwise the admin switches it off. */
export async function deleteFunfactQuestion(env: Env, id: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ text: string }[]>`select text from valk.funfact_questions where id = ${id} for update`;
    if (!row) return;
    if ((await answerCount(sql, id)) > 0) {
      throw new FunfactError("Er zijn al antwoorden op deze vraag. Zet hem uit in plaats van hem te verwijderen.");
    }
    await sql`delete from valk.funfact_questions where id = ${id}`;
    await logAudit(actor, { action: "funfacts.vraag.verwijderd", entity: "funfactvraag", entityId: id, oldValue: { vraag: row.text } }, sql, env);
  });
}

/** One place up or down; the numbering is made tidy (1, 2, 3…) on the way. */
export async function moveFunfactQuestion(env: Env, id: string, direction: "op" | "neer", actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext('valk.funfact_questions.sort'))`;
    const rows = await sql<{ id: string; text: string }[]>`select id, text from valk.funfact_questions order by sort, created_at`;
    const index = rows.findIndex((r) => r.id === id);
    const target = direction === "op" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries()) {
      await sql`update valk.funfact_questions set sort = ${position + 1}, updated_at = now() where id = ${row.id} and sort <> ${position + 1}`;
    }
    await logAudit(
      actor,
      { action: "funfacts.volgorde", entity: "funfactvraag", entityId: id, newValue: { vraag: rows[target].text, plek: target + 1 } },
      sql,
      env,
    );
  });
}

/* ------------------------------------------------------------------------ */
/* Admin: export                                                             */
/* ------------------------------------------------------------------------ */

export type ExportPerson = {
  id: string;
  name: string;
  nickname: string | null;
  team: string | null;
  doneAt: string | null;
};

export type ExportData = {
  questions: FunfactQuestion[];
  people: ExportPerson[];
  answers: Map<string, Map<string, StoredAnswer>>;
};

export async function exportData(env: Env): Promise<ExportData> {
  const [questions, people, answers] = await Promise.all([
    listFunfactQuestions(),
    db()<{ id: string; name: string; nickname: string | null; team: string | null; funfacts_done_at: Date | null }[]>`
      select p.id, p.name, p.nickname, t.name as team, p.funfacts_done_at
      from valk.participants p left join valk.teams t on t.id = p.team_id
      where p.env = ${env}
      order by lower(p.name)
    `,
    listAllAnswers(env),
  ]);
  const byPerson = new Map<string, Map<string, StoredAnswer>>();
  for (const answer of answers) {
    const map = byPerson.get(answer.participantId) ?? new Map<string, StoredAnswer>();
    map.set(answer.questionId, answer);
    byPerson.set(answer.participantId, map);
  }
  return {
    questions,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      team: p.team,
      doneAt: p.funfacts_done_at?.toISOString() ?? null,
    })),
    answers: byPerson,
  };
}

export type ExportPhoto = { id: string; fileName: string; size: number; createdAt: Date; ai: boolean };

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The fun-fact photos in use, plus their AI versions, with readable unique file names. */
export async function exportPhotos(env: Env): Promise<ExportPhoto[]> {
  const [questions, rows] = await Promise.all([
    listFunfactQuestions(),
    db()<{ id: string; mime: string; size_bytes: number; created_at: Date; name: string; question_id: string; ai: boolean }[]>`
      select u.id, u.mime, u.size_bytes, u.created_at, p.name, a.question_id, false as ai
      from valk.funfact_answers a
      join valk.participants p on p.id = a.participant_id and p.env = ${env}
      join valk.uploads u on u.id::text = a.value ->> 'upload' and u.kind = 'funfact'
      where not a.skipped
      union all
      select x.id, x.mime, x.size_bytes, x.created_at, p.name, a.question_id, true as ai
      from valk.funfact_answers a
      join valk.participants p on p.id = a.participant_id and p.env = ${env}
      join valk.uploads u on u.id::text = a.value ->> 'upload' and u.kind = 'funfact'
      join valk.uploads x on x.original_id = u.id and x.kind = 'ai'
      where not a.skipped
    `,
  ]);
  // Numbered like the list the admin sees: question 24 → "24-sanne-valkenburg.jpg".
  const position = new Map(questions.map((q, index) => [q.id, index + 1]));
  const sorted = [...rows].sort(
    (a, b) =>
      (position.get(a.question_id) ?? 0) - (position.get(b.question_id) ?? 0) ||
      a.name.localeCompare(b.name, "nl") ||
      Number(a.ai) - Number(b.ai),
  );
  const used = new Set<string>();
  return sorted.map((row) => {
    const base = `${String(position.get(row.question_id) ?? 0).padStart(2, "0")}-${fileSlug(row.name)}${row.ai ? "-ai" : ""}`;
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
    used.add(name);
    return {
      id: row.id,
      fileName: `${name}.${EXTENSION[row.mime] ?? "jpg"}`,
      size: row.size_bytes,
      createdAt: row.created_at,
      ai: row.ai,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Admin: photos for Echt of AI (SPEC §4.6)                                  */
/* ------------------------------------------------------------------------ */

export type FunfactPhoto = {
  id: string;
  participantId: string;
  name: string;
  teamId: string | null;
  questionText: string;
  quizVariant: "echt" | "ai" | null;
  aiId: string | null;
  createdAt: string;
};

export async function listFunfactPhotos(env: Env): Promise<FunfactPhoto[]> {
  const rows = await db()<
    {
      id: string;
      quiz_variant: "echt" | "ai" | null;
      created_at: Date;
      participant_id: string;
      name: string;
      team_id: string | null;
      question_text: string;
      ai_id: string | null;
    }[]
  >`
    select u.id, u.quiz_variant, u.created_at, p.id as participant_id, p.name, p.team_id,
      q.text as question_text, ai.id as ai_id
    from valk.funfact_answers a
    join valk.participants p on p.id = a.participant_id
    join valk.funfact_questions q on q.id = a.question_id
    join valk.uploads u on u.id::text = a.value ->> 'upload' and u.kind = 'funfact'
    left join lateral (
      select x.id from valk.uploads x
      where x.original_id = u.id and x.kind = 'ai'
      order by x.created_at desc
      limit 1
    ) ai on true
    where p.env = ${env} and not a.skipped
    order by q.sort, lower(p.name)
  `;
  return rows.map((r) => ({
    id: r.id,
    participantId: r.participant_id,
    name: r.name,
    teamId: r.team_id,
    questionText: r.question_text,
    quizVariant: r.quiz_variant,
    aiId: r.ai_id,
    createdAt: r.created_at.toISOString(),
  }));
}

/** The person whose fun-fact photo this is, if it is one in this environment. */
async function photoOwner(sql: Query, env: Env, originalId: string): Promise<{ name: string; variant: "echt" | "ai" | null } | null> {
  if (!isUuid(originalId)) return null;
  const [row] = await sql<{ name: string; quiz_variant: "echt" | "ai" | null }[]>`
    select p.name, u.quiz_variant
    from valk.uploads u
    join valk.funfact_answers a on a.value ->> 'upload' = u.id::text and not a.skipped
    join valk.participants p on p.id = a.participant_id and p.env = ${env}
    where u.id = ${originalId} and u.kind = 'funfact'
    limit 1
  `;
  return row ? { name: row.name, variant: row.quiz_variant } : null;
}

/** Link a freshly uploaded AI version to a fun-fact photo (an earlier AI version goes). */
export async function linkAiVersion(env: Env, originalId: string, aiId: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const owner = await photoOwner(sql, env, originalId);
    if (!owner) throw new FunfactError("Deze foto bestaat niet meer.");
    if (!isUuid(aiId)) throw new FunfactError("De AI-versie kwam niet goed aan. Upload hem opnieuw.");
    const [ai] = await sql<{ original_id: string | null }[]>`
      select original_id from valk.uploads where id = ${aiId} and kind = 'ai' for update
    `;
    if (!ai) throw new FunfactError("De AI-versie kwam niet goed aan. Upload hem opnieuw.");
    if (ai.original_id && ai.original_id !== originalId) throw new FunfactError("Deze AI-versie hoort al bij een andere foto.");
    await sql`delete from valk.uploads where original_id = ${originalId} and kind = 'ai' and id <> ${aiId}`;
    await sql`update valk.uploads set original_id = ${originalId} where id = ${aiId}`;
    // AI uploads that never got linked (a closed tab halfway) are tidied up here.
    await sql`delete from valk.uploads where kind = 'ai' and original_id is null and created_at < now() - interval '1 day'`;
    await logAudit(
      actor,
      { action: "funfacts.ai", entity: "foto", entityId: originalId, newValue: { van: owner.name, aiVersie: "geüpload" } },
      sql,
      env,
    );
  });
}

export async function removeAiVersion(env: Env, originalId: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const owner = await photoOwner(sql, env, originalId);
    if (!owner) throw new FunfactError("Deze foto bestaat niet meer.");
    const removed = await sql`delete from valk.uploads where original_id = ${originalId} and kind = 'ai' returning id`;
    if (owner.variant === "ai") await sql`update valk.uploads set quiz_variant = null where id = ${originalId}`;
    if (removed.length > 0) {
      await logAudit(
        actor,
        { action: "funfacts.ai", entity: "foto", entityId: originalId, oldValue: { van: owner.name, aiVersie: "verwijderd", quizversie: owner.variant } },
        sql,
        env,
      );
    }
  });
}

/** Which version goes into the quiz: the right answer of Echt of AI follows from it. */
export async function setQuizVariant(env: Env, originalId: string, variant: "echt" | "ai" | null, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const owner = await photoOwner(sql, env, originalId);
    if (!owner) throw new FunfactError("Deze foto bestaat niet meer.");
    if (variant === "ai") {
      const [ai] = await sql`select id from valk.uploads where original_id = ${originalId} and kind = 'ai' limit 1`;
      if (!ai) throw new FunfactError("Upload eerst een AI-versie van deze foto.");
    }
    if (owner.variant === variant) return;
    await sql`update valk.uploads set quiz_variant = ${variant} where id = ${originalId}`;
    await logAudit(
      actor,
      {
        action: "funfacts.quizversie",
        entity: "foto",
        entityId: originalId,
        oldValue: { van: owner.name, quizversie: owner.variant },
        newValue: { van: owner.name, quizversie: variant },
      },
      sql,
      env,
    );
  });
}

/* ------------------------------------------------------------------------ */
/* The main quiz: drafts go into a round with one tap                        */
/* ------------------------------------------------------------------------ */

export const MAIN_QUIZ_TITLE = "De Grote Valkenburger Quiz";

/** The rounds of SPEC §9.2 ("Rondes (voorstel)"). */
export const MAIN_QUIZ_ROUNDS = [
  { number: 1, title: "Familie in cijfers", listening: false, intermezzoAfter: false },
  { number: 2, title: "Waar ligt Valkenburg?", listening: false, intermezzoAfter: false },
  { number: 3, title: "Muziek", listening: true, intermezzoAfter: true },
  { number: 4, title: "Hemelvaart, lente en de Dommel", listening: false, intermezzoAfter: false },
  { number: 5, title: "Echt of AI?", listening: false, intermezzoAfter: false },
] as const;

export type QuizRoundOverview = { number: number; title: string; texts: string[] };

/** The rounds of the main quiz with their question texts (or the proposal, when there is no quiz yet). */
export async function mainQuizRounds(): Promise<QuizRoundOverview[]> {
  const rows = await db()<{ number: number; title: string; texts: string[] }[]>`
    with main as (select id from valk.quizzes where not is_demo order by created_at limit 1)
    select r.number, r.title,
      coalesce(array_agg(qq.text order by qq.sort) filter (where qq.id is not null), '{}') as texts
    from valk.quiz_rounds r
    join main on main.id = r.quiz_id
    left join valk.quiz_questions qq on qq.round_id = r.id
    group by r.number, r.title
    order by r.number
  `;
  if (rows.length > 0) return rows.map((r) => ({ number: r.number, title: r.title, texts: r.texts }));
  return MAIN_QUIZ_ROUNDS.map((r) => ({ number: r.number, title: r.title, texts: [] }));
}

async function ensureMainQuiz(sql: TransactionSql): Promise<string> {
  await sql`select pg_advisory_xact_lock(hashtext('valk.main_quiz'))`;
  const [quiz] = await sql<{ id: string }[]>`select id from valk.quizzes where not is_demo order by created_at limit 1`;
  if (quiz) return quiz.id;
  const [created] = await sql<{ id: string }[]>`
    insert into valk.quizzes (title, is_demo) values (${MAIN_QUIZ_TITLE}, false) returning id
  `;
  for (const round of MAIN_QUIZ_ROUNDS) {
    await sql`
      insert into valk.quiz_rounds (quiz_id, number, title, listening, intermezzo_after)
      values (${created.id}, ${round.number}, ${round.title}, ${round.listening}, ${round.intermezzoAfter})
    `;
  }
  return created.id;
}

/**
 * Put the draft of a fun fact into a round of the main quiz as a
 * `meerkeuze` question (the contract with the quiz). The draft is worked out
 * again from the real answers, so what goes in is never stale.
 */
export async function adoptConcept(
  questionId: string,
  roundNumber: number,
  actor: Actor,
): Promise<{ round: number; roundTitle: string; text: string }> {
  const question = await getFunfactQuestion(questionId);
  if (!question) throw new FunfactError("Deze vraag bestaat niet meer.");
  const result = await conceptFor("live", question);
  if (!result.ok) throw new FunfactError(result.reason);
  const { draft } = result;
  return db().begin(async (sql) => {
    const quizId = await ensureMainQuiz(sql);
    const [round] = await sql<{ id: string; title: string }[]>`
      select id, title from valk.quiz_rounds where quiz_id = ${quizId} and number = ${roundNumber}
    `;
    if (!round) throw new FunfactError(`Ronde ${roundNumber} bestaat niet in de quiz.`);
    await sql`
      insert into valk.quiz_questions (round_id, sort, kind, text, options, correct, explanation, subjects)
      values (
        ${round.id},
        (select coalesce(max(sort), 0) + 1 from valk.quiz_questions where round_id = ${round.id}),
        'meerkeuze', ${draft.text}, ${sql.json(draft.options)}, ${sql.json(draft.correct)}, ${draft.explanation},
        '[]'::jsonb
      )
    `;
    await logAudit(
      actor,
      {
        action: "funfacts.conceptvraag",
        entity: "quizvraag",
        entityId: questionId,
        newValue: { ronde: roundNumber, vraag: draft.text, opties: draft.options, goed: draft.correct },
      },
      sql,
      "live",
    );
    return { round: roundNumber, roundTitle: round.title, text: draft.text };
  });
}

/* ------------------------------------------------------------------------ */
/* Sample data for "Zet de proef klaar"                                      */
/* ------------------------------------------------------------------------ */

const SAMPLE_TEXTS = {
  nummer: [
    "Dancing Queen, ABBA",
    "Bohemian Rhapsody, Queen",
    "Zoutelande, BLØF",
    "Mr. Blue Sky, Electric Light Orchestra",
    "Het is een nacht, Guus Meeuwis",
    "Happy, Pharrell Williams",
  ],
  vakantie: [
    "Onze tent woei weg op Terschelling, met ons erin.",
    "Ik werd in Italië aangezien voor een beroemde voetballer.",
    "We misten de boot en sliepen een nacht in de haven.",
    "Een geit at mijn paspoort op. Echt waar.",
    "In de Ardennen kwamen we drie keer langs hetzelfde kapelletje.",
  ],
};

/** A tiny pseudo-random generator, so the sample data is the same every time. */
function random(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function hashText(text: string): number {
  let hash = 7;
  for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** A small retro picture (three lanes and a sun) as PNG, as a stand-in photo in the test environment. */
export function samplePng(variant: number, width = 360, height = 270): Uint8Array {
  const lanes: [number, number, number][] = [
    [0xf5, 0xae, 0x1b],
    [0xf0, 0x6a, 0x1f],
    [0xb4, 0x44, 0x1a],
  ];
  const sky: [number, number, number] = variant % 2 === 0 ? [0x4f, 0xa3, 0xa5] : [0xfc, 0xeb, 0xd0];
  const ground: [number, number, number] = [0x2b, 0x18, 0x10];
  const sunX = 60 + ((variant * 97) % (width - 120));
  const raw = new Uint8Array((width * 3 + 1) * height);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    raw[position++] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = y < height * 0.6 ? sky : ground;
      const dx = x - sunX;
      const dy = y - 70;
      if (dx * dx + dy * dy < 34 * 34) color = lanes[0];
      const band = Math.floor((y - height * 0.6 + (x * (variant % 3)) / 6) / 14);
      if (y >= height * 0.6 && band >= 0 && band < 3) color = lanes[band];
      raw[position++] = color[0];
      raw[position++] = color[1];
      raw[position++] = color[2];
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Answers for the test names, so statistics, drafts and Echt of AI can be
 * tried out: most names are done, a few are halfway, one has not started.
 */
export async function seedTestFunfacts(sql: TransactionSql): Promise<void> {
  const people = await sql<{ id: string; name: string }[]>`
    select id, name from valk.participants where env = 'test' order by name
  `;
  const questions = await listFunfactQuestions({ activeOnly: true }, sql);
  let photos = 0;
  for (const [index, person] of people.entries()) {
    if (index === people.length - 1) continue; // one name has not started yet
    const next = random(hashText(person.name));
    const halfway = index >= people.length - 3;
    const count = halfway ? Math.ceil(questions.length / 2) : questions.length;
    for (const question of questions.slice(0, count)) {
      let value: FunfactValue | null = null;
      if (next() >= 0.08) {
        switch (question.kind) {
          case "ja_nee":
            value = { bool: next() < 0.45 };
            break;
          case "getal": {
            const min = question.min ?? 0;
            const max = question.max ?? 100;
            value = { number: Math.round(min + (max - min) * next() ** 3) };
            break;
          }
          case "keuze": {
            const options = question.options ?? [];
            if (options.length > 0) value = { choice: options[Math.floor(next() * options.length)] };
            break;
          }
          case "open": {
            const list = /nummer/i.test(question.text) ? SAMPLE_TEXTS.nummer : SAMPLE_TEXTS.vakantie;
            value = { text: list[Math.floor(next() * list.length)] };
            break;
          }
          case "foto": {
            if (photos >= 4) break;
            const bytes = samplePng(photos);
            const [upload] = await sql<{ id: string }[]>`
              insert into valk.uploads (kind, participant_id, mime, bytes, width, height, size_bytes, created_by)
              values ('funfact', ${person.id}, 'image/png', ${Buffer.from(bytes)}, 360, 270, ${bytes.length}, 'proef')
              returning id
            `;
            value = { upload: upload.id };
            photos += 1;
            break;
          }
        }
      }
      await sql`
        insert into valk.funfact_answers (participant_id, question_id, value, skipped)
        values (${person.id}, ${question.id}, ${value === null ? null : sql.json(value as postgres.JSONValue)}, ${value === null})
      `;
    }
    if (!halfway) await sql`update valk.participants set funfacts_done_at = now() where id = ${person.id}`;
  }
}
