import "server-only";
import type postgres from "postgres";
import { isMapScale } from "@/lib/shared/geo";
import { db } from "../db";
import { isUuid } from "../teams";
import type { QuestionType, QuizContent, QuizQuestion, QuizRound } from "./types";

/**
 * Quiz content in the database: a quiz with its rounds and questions, and
 * the main quiz of the weekend. No Next.js request APIs in here, so the
 * command line (`npm run import:quiz`) uses it too.
 */

export type Sql = postgres.ISql;

export const MAIN_QUIZ_TITLE = "De Grote Valkenburger Quiz";

/** The five rounds proposed in SPEC §9.2, for a new main quiz. */
export const DEFAULT_ROUNDS = [
  { number: 1, title: "Familie in cijfers", listening: false, intermezzoAfter: false },
  { number: 2, title: "Waar ligt Valkenburg?", listening: false, intermezzoAfter: false },
  { number: 3, title: "Muziek", listening: true, intermezzoAfter: true },
  { number: 4, title: "Hemelvaart, lente en de Dommel", listening: false, intermezzoAfter: false },
  { number: 5, title: "Echt of AI?", listening: false, intermezzoAfter: false },
] as const;

type RoundRow = {
  id: string;
  quiz_id: string;
  number: number;
  title: string;
  intro: string | null;
  listening: boolean;
  intermezzo_after: boolean;
  max_points: number | null;
};

export type QuestionRow = {
  id: string;
  round_id: string;
  sort: number;
  ext_id: string | null;
  kind: QuestionType;
  text: string;
  options: unknown;
  correct: unknown;
  unit: string | null;
  scale: string | null;
  explanation: string | null;
  photo_upload_id: string | null;
  extra_photo_ids: string[] | null;
  photo_credit: string | null;
  subjects: unknown;
  note: string | null;
};

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function toQuestion(row: QuestionRow): QuizQuestion {
  return {
    id: row.id,
    roundId: row.round_id,
    sort: row.sort,
    extId: row.ext_id,
    kind: row.kind,
    text: row.text,
    options: Array.isArray(row.options) ? strings(row.options) : null,
    correct: row.correct,
    unit: row.unit,
    scale: isMapScale(row.scale) ? row.scale : null,
    explanation: row.explanation,
    photoUploadId: row.photo_upload_id,
    extraPhotoIds: row.extra_photo_ids ?? [],
    photoCredit: row.photo_credit,
    subjects: strings(row.subjects),
    note: row.note,
  };
}

function toRound(row: RoundRow, questions: QuizQuestion[]): QuizRound {
  return {
    id: row.id,
    quizId: row.quiz_id,
    number: row.number,
    title: row.title,
    intro: row.intro,
    listening: row.listening,
    intermezzoAfter: row.intermezzo_after,
    maxPoints: row.max_points,
    questions,
  };
}

/** A quiz with its rounds and questions, or null. */
export async function loadContent(quizId: string, sql: Sql = db()): Promise<QuizContent | null> {
  if (!isUuid(quizId)) return null;
  const [quiz] = await sql<{ id: string; title: string; is_demo: boolean }[]>`
    select id, title, is_demo from valk.quizzes where id = ${quizId}
  `;
  if (!quiz) return null;
  const [rounds, questions] = await Promise.all([
    sql<RoundRow[]>`
      select id, quiz_id, number, title, intro, listening, intermezzo_after, max_points
      from valk.quiz_rounds where quiz_id = ${quizId} order by number
    `,
    sql<QuestionRow[]>`
      select q.id, q.round_id, q.sort, q.ext_id, q.kind, q.text, q.options, q.correct, q.unit, q.scale,
        q.explanation, q.photo_upload_id, q.extra_photo_ids, q.photo_credit, q.subjects, q.note
      from valk.quiz_questions q join valk.quiz_rounds r on r.id = q.round_id
      where r.quiz_id = ${quizId}
      order by q.sort, q.id
    `,
  ]);
  const byRound = new Map<string, QuizQuestion[]>();
  const versions = await photoVersions(
    sql,
    questions.filter((row) => row.kind === "echt_of_ai" && row.photo_upload_id).map((row) => row.photo_upload_id!),
  );
  for (const row of questions) {
    const list = byRound.get(row.round_id) ?? [];
    list.push(withPhotoVersion(toQuestion(row), versions));
    byRound.set(row.round_id, list);
  }
  return {
    id: quiz.id,
    title: quiz.title,
    isDemo: quiz.is_demo,
    rounds: rounds.map((row) => toRound(row, byRound.get(row.id) ?? [])),
  };
}

/* ------------------------------------------------------------------------ */
/* Echt of AI with the fun-fact photos (SPEC §4.6): the admin uploads an AI  */
/* version per photo and picks which one goes into the quiz. The right       */
/* answer follows from that choice.                                          */
/* ------------------------------------------------------------------------ */

export type PhotoVersion = { showId: string; correct: "echt" | "ai" };

/** For each photo: the version the phones see, and the right answer that follows from it. */
export async function photoVersions(sql: Sql, ids: readonly string[]): Promise<Record<string, PhotoVersion>> {
  const unique = [...new Set(ids.filter(isUuid))];
  if (unique.length === 0) return {};
  const rows = await sql<{ id: string; kind: string; quiz_variant: "echt" | "ai" | null; ai_id: string | null }[]>`
    select u.id, u.kind, u.quiz_variant,
      (select a.id from valk.uploads a where a.original_id = u.id and a.kind = 'ai' order by a.created_at desc limit 1) as ai_id
    from valk.uploads u
    where u.id in ${sql(unique)}
  `;
  const result: Record<string, PhotoVersion> = {};
  for (const row of rows) {
    if (row.kind === "ai") result[row.id] = { showId: row.id, correct: "ai" };
    else if (row.kind === "funfact" && row.quiz_variant === "ai" && row.ai_id) result[row.id] = { showId: row.ai_id, correct: "ai" };
    else if (row.kind === "funfact" && row.quiz_variant) result[row.id] = { showId: row.id, correct: "echt" };
  }
  return result;
}

export function withPhotoVersion(question: QuizQuestion, versions: Readonly<Record<string, PhotoVersion>>): QuizQuestion {
  const version = question.kind === "echt_of_ai" && question.photoUploadId ? versions[question.photoUploadId] : undefined;
  if (!version) return { ...question, displayPhotoId: question.photoUploadId };
  return { ...question, displayPhotoId: version.showId, correct: version.correct };
}

/**
 * Write the right answer that follows from the photo admin into the
 * question itself, so everything that reads the table (the scoreboard)
 * agrees with the quiz.
 */
export async function syncPhotoVersions(sql: Sql, content: QuizContent): Promise<void> {
  for (const round of content.rounds) {
    for (const question of round.questions) {
      if (question.kind !== "echt_of_ai" || !question.photoUploadId) continue;
      if (question.correct !== "echt" && question.correct !== "ai") continue;
      await sql`
        update valk.quiz_questions set correct = ${sql.json(question.correct)}
        where id = ${question.id} and correct is distinct from ${sql.json(question.correct)}
      `;
    }
  }
}

export type QuizSummary = { id: string; title: string; isDemo: boolean; questions: number };

export async function listQuizzes(sql: Sql = db()): Promise<QuizSummary[]> {
  const rows = await sql<{ id: string; title: string; is_demo: boolean; questions: number }[]>`
    select z.id, z.title, z.is_demo, count(q.id)::int as questions
    from valk.quizzes z
    left join valk.quiz_rounds r on r.quiz_id = z.id
    left join valk.quiz_questions q on q.round_id = r.id
    group by z.id, z.title, z.is_demo, z.created_at
    order by z.is_demo, z.created_at
  `;
  return rows.map((row) => ({ id: row.id, title: row.title, isDemo: row.is_demo, questions: row.questions }));
}

/** The real quiz of the weekend (not the demo), if it exists. */
export async function findMainQuizId(sql: Sql = db()): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`select id from valk.quizzes where not is_demo order by created_at limit 1`;
  return row?.id ?? null;
}

export async function findDemoQuizId(sql: Sql = db()): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`select id from valk.quizzes where is_demo order by created_at desc limit 1`;
  return row?.id ?? null;
}

/**
 * The main quiz, made with the five rounds of SPEC §9.2 when it does not
 * exist yet. Other parts of the app (concept questions from the fun facts)
 * add to the same quiz, so it is made once, under a lock.
 */
export async function ensureMainQuiz(sql: postgres.TransactionSql): Promise<string> {
  await sql`select pg_advisory_xact_lock(hashtext('valk.hoofdquiz'))`;
  const existing = await findMainQuizId(sql);
  if (existing) return existing;
  const [quiz] = await sql<{ id: string }[]>`
    insert into valk.quizzes (title, is_demo) values (${MAIN_QUIZ_TITLE}, false) returning id
  `;
  for (const round of DEFAULT_ROUNDS) {
    await sql`
      insert into valk.quiz_rounds (quiz_id, number, title, listening, intermezzo_after, max_points)
      values (${quiz.id}, ${round.number}, ${round.title}, ${round.listening}, ${round.intermezzoAfter}, 0)
    `;
  }
  return quiz.id;
}
