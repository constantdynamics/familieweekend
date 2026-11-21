/**
 * Practising the quiz (oefenen): a beheerder or spelleider plays questions
 * alone, as the captain of a made-up team, to see exactly what a captain
 * sees. The owner's choices: one question, one round or the whole quiz;
 * nothing is stored; no timer, no joker, no quizmaster note and no
 * intermezzo.
 *
 * Pure: the steps of a run, and the captain's view at one step. The view
 * comes from buildQuizView with the practice team as the only team, so the
 * screen and the points are those of the real evening.
 */
import { parseAnswer, type StoredAnswer } from "./answers";
import { findQuestion, findRound, playableRounds } from "./engine";
import type { QuizContent, QuizView } from "./types";
import { buildQuizView, type TeamRow } from "./view";

/** The made-up team of the one who practises. It is never stored. */
export const OEFENTEAM: TeamRow = { id: "oefenteam", name: "Oefenteam", color: "mosterd", hasDevice: true, captainName: null };

export type OefenFase = "rondescherm" | "open" | "onthuld";

/** A round screen (vraag null) or a question of round `ronde`. */
export type OefenStap = { ronde: number; vraag: string | null };

export type OefenKeuze = { soort: "vraag"; vraag: string } | { soort: "ronde"; ronde: number } | { soort: "quiz" };

/**
 * The steps of a run, in quiz order. A single question starts at the
 * question itself; a round, or the whole quiz, shows each round screen
 * first. Rounds without questions are left out, like on the evening.
 */
export function oefenStappen(content: QuizContent, keuze: OefenKeuze): OefenStap[] {
  if (keuze.soort === "vraag") {
    const found = findQuestion(content, keuze.vraag);
    return found ? [{ ronde: found.round.number, vraag: found.question.id }] : [];
  }
  return playableRounds(content)
    .filter((round) => keuze.soort === "quiz" || round.number === keuze.ronde)
    .flatMap((round) => [{ ronde: round.number, vraag: null }, ...round.questions.map((question) => ({ ronde: round.number, vraag: question.id }))]);
}

/** A step that exists in this quiz: the round has questions, and the question sits in that round. */
export function bestaandeStap(content: QuizContent, stap: OefenStap): boolean {
  const round = findRound(content, stap.ronde);
  if (!round || round.questions.length === 0) return false;
  return stap.vraag === null || round.questions.some((question) => question.id === stap.vraag);
}

export type OefenViewInput = {
  env: "live" | "test";
  now: number;
  content: QuizContent;
  stap: OefenStap;
  /** For a round screen the phase is always "rondescherm". */
  fase: OefenFase;
  /** The practice captain's answer as the phone sent it; checked here like a real one. */
  antwoord: unknown;
  photoUrl: string | null;
  extraPhotoUrls: string[];
  submitter: string | null;
};

/** What the captain of the practice team sees at one step, or null for a step that does not exist. */
export function oefenView(input: OefenViewInput): QuizView | null {
  const { content, stap } = input;
  if (!bestaandeStap(content, stap)) return null;
  const found = stap.vraag ? findQuestion(content, stap.vraag) : null;
  const question = found?.question ?? null;
  const answer = question ? parseAnswer(question, input.antwoord) : null;
  const answers: Record<string, StoredAnswer> = answer ? { [OEFENTEAM.id]: { answer, overrideTwelfths: null } } : {};
  const view = buildQuizView({
    env: input.env,
    version: 0,
    now: input.now,
    state: {
      mode: "quiz",
      quizId: content.id,
      roundNo: stap.ronde,
      questionId: question?.id ?? null,
      phase: question ? input.fase : "rondescherm",
      // A captain always gets the question, also in a listening round.
      listening: false,
      countdownUntil: null,
    },
    lockClosed: false,
    content,
    teams: [OEFENTEAM],
    answers,
    jokers: {},
    standings: null,
    viewer: { role: "captain", teamId: OEFENTEAM.id, captainTakenOver: false, suggestCaptainLogin: false },
    // Like a real phone: a photo only with a question that has one.
    photoUrl: question?.photoUploadId ? input.photoUrl : null,
    extraPhotoUrls: question?.photoUploadId ? input.extraPhotoUrls : [],
    submitter: question?.photoUploadId ? input.submitter : null,
  });
  // No joker when practising.
  view.me.canJoker = false;
  return view;
}
