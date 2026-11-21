import "server-only";
import type { RequestContext } from "../context";
import { db } from "../db";
import { isUuid } from "../teams";
import { signedPhotoUrl } from "../uploads";
import { findMainQuizId, listQuizzes, loadContent } from "./content";
import { findQuestion, playableRounds } from "./engine";
import { oefenStappen, oefenView, type OefenFase, type OefenKeuze, type OefenStap } from "./oefenplan";
import { loadSubmitters, submitterLabel } from "./store";
import type { QuizView } from "./types";

/**
 * Practising the quiz, the parts that need the database (see oefenplan.ts).
 * Only for the beheerder and spelleiders: they see every question and
 * answer. Nothing is written.
 */

/** A practice run can take a while; the page can always be reloaded. */
const FOTO_TTL_S = 2 * 60 * 60;

export function magOefenen(ctx: RequestContext): boolean {
  return ctx.isAdmin || ctx.staff?.role === "spelleider";
}

export type OefenPlan = {
  quizId: string;
  soort: OefenKeuze["soort"];
  stappen: OefenStap[];
  /** Where "Stop" and "Klaar" lead. */
  terug: { href: string; label: string };
};

export type OefenVraag = { vraag?: string; ronde?: string; quiz?: string };

/**
 * The run for ?vraag= (a question id), ?ronde= (a round id) or ?quiz= (a
 * quiz id). The beheerder returns to where they started; a spelleider to
 * the practice overview.
 */
export async function oefenPlan(vraag: OefenVraag, isAdmin: boolean): Promise<OefenPlan | null> {
  const sql = db();
  if (vraag.vraag) {
    if (!isUuid(vraag.vraag)) return null;
    const [row] = await sql<{ quiz_id: string }[]>`
      select r.quiz_id from valk.quiz_questions q join valk.quiz_rounds r on r.id = q.round_id where q.id = ${vraag.vraag}
    `;
    const content = row ? await loadContent(row.quiz_id) : null;
    if (!content) return null;
    return {
      quizId: content.id,
      soort: "vraag",
      stappen: oefenStappen(content, { soort: "vraag", vraag: vraag.vraag }),
      terug: isAdmin ? { href: `/beheer/quiz/vraag/${vraag.vraag}`, label: "Terug naar de vraag" } : { href: "/quiz/oefenen", label: "Terug" },
    };
  }
  if (vraag.ronde) {
    if (!isUuid(vraag.ronde)) return null;
    const [row] = await sql<{ quiz_id: string; number: number }[]>`
      select quiz_id, number from valk.quiz_rounds where id = ${vraag.ronde}
    `;
    const content = row ? await loadContent(row.quiz_id) : null;
    if (!row || !content) return null;
    return {
      quizId: content.id,
      soort: "ronde",
      stappen: oefenStappen(content, { soort: "ronde", ronde: row.number }),
      terug: isAdmin ? { href: `/beheer/quiz/ronde/${vraag.ronde}`, label: `Terug naar ronde ${row.number}` } : { href: "/quiz/oefenen", label: "Terug" },
    };
  }
  const quizId = vraag.quiz && isUuid(vraag.quiz) ? vraag.quiz : await findMainQuizId();
  const content = quizId ? await loadContent(quizId) : null;
  if (!content) return null;
  return {
    quizId: content.id,
    soort: "quiz",
    stappen: oefenStappen(content, { soort: "quiz" }),
    terug: isAdmin
      ? { href: content.isDemo ? "/beheer/quiz?quiz=demo" : "/beheer/quiz", label: "Terug naar de quiz" }
      : { href: "/quiz/oefenen", label: "Terug" },
  };
}

/** One step of a run as the practice captain sees it, with fresh photo links. */
export async function oefenViewVoor(ctx: RequestContext, quizId: string, stap: OefenStap, fase: OefenFase, antwoord: unknown): Promise<QuizView | null> {
  const content = isUuid(quizId) ? await loadContent(quizId) : null;
  if (!content) return null;
  const question = stap.vraag ? (findQuestion(content, stap.vraag)?.question ?? null) : null;
  const photoId = question?.photoUploadId ? (question.displayPhotoId ?? question.photoUploadId) : null;
  const [photoUrl, extraPhotoUrls, submitters] = await Promise.all([
    photoId ? signedPhotoUrl(photoId, FOTO_TTL_S) : Promise.resolve(null),
    question?.photoUploadId && question.extraPhotoIds?.length
      ? Promise.all(question.extraPhotoIds.map((id) => signedPhotoUrl(id, FOTO_TTL_S)))
      : Promise.resolve([]),
    question?.kind === "echt_of_ai" && question.photoUploadId
      ? loadSubmitters(ctx.env, [question.photoUploadId])
      : Promise.resolve({} as Awaited<ReturnType<typeof loadSubmitters>>),
  ]);
  return oefenView({
    env: ctx.env,
    now: Date.now(),
    content,
    stap,
    fase,
    antwoord,
    photoUrl,
    extraPhotoUrls,
    submitter: question?.photoUploadId ? submitterLabel(submitters[question.photoUploadId]) : null,
  });
}

export type OefenOverzicht = {
  id: string;
  title: string;
  isDemo: boolean;
  rondes: { id: string; number: number; title: string; vragen: number }[];
}[];

/** The quizzes with questions, the main quiz first, for the practice overview. */
export async function oefenOverzicht(): Promise<OefenOverzicht> {
  const quizzes = (await listQuizzes()).filter((quiz) => quiz.questions > 0).sort((a, b) => Number(a.isDemo) - Number(b.isDemo));
  const contents = await Promise.all(quizzes.map((quiz) => loadContent(quiz.id)));
  return contents.flatMap((content) =>
    content
      ? [
          {
            id: content.id,
            title: content.title,
            isDemo: content.isDemo,
            rondes: playableRounds(content).map((round) => ({ id: round.id, number: round.number, title: round.title, vragen: round.questions.length })),
          },
        ]
      : [],
  );
}
