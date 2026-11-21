/**
 * Answers and right answers per question type (SPEC §4.6 "Vraagtypes"),
 * as pure functions: what a captain may send, what is stored, how a stored
 * question becomes a question for quizScoring, and the plausible guesses of
 * the test teams that answer by themselves.
 */
import { isMapScale } from "@/lib/shared/geo";
import { scoreQuestion, type Answer, type Question, type QuestionScore } from "@/lib/shared/quizScoring";
import { TWELFTHS } from "@/lib/shared/scoring";
import { isChoiceType, type CorrectValue, type QuizQuestion } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Longitude folded into −180…180, so a map that scrolled round the world still stores a normal place. */
export function foldLongitude(lng: number): number {
  const folded = ((((lng + 180) % 360) + 360) % 360) - 180;
  return Number(folded.toFixed(6));
}

/** The largest estimate a captain can type (the keypad stops long before). */
export const MAX_ESTIMATE = 1e12;

/**
 * The answer a captain sent, checked against the question: the right shape
 * for the type and nothing else. Null when it does not fit.
 */
export function parseAnswer(question: Pick<QuizQuestion, "kind" | "options">, raw: unknown): Answer | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  const only = (key: string) => keys.length === 1 && keys[0] === key;
  switch (question.kind) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik": {
      const count = question.options?.length ?? 0;
      const choice = raw.choice;
      if (!only("choice") || typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= count) return null;
      return { choice };
    }
    case "waar_niet_waar":
      return only("bool") && typeof raw.bool === "boolean" ? { bool: raw.bool } : null;
    case "echt_of_ai":
      return only("realOrAi") && (raw.realOrAi === "echt" || raw.realOrAi === "ai") ? { realOrAi: raw.realOrAi } : null;
    case "schatting": {
      const number = raw.number;
      if (!only("number") || !isFiniteNumber(number) || Math.abs(number) > MAX_ESTIMATE) return null;
      // At most four decimals: the keypad types two, more is noise.
      return { number: Number(number.toFixed(4)) || 0 };
    }
    case "kaart": {
      const { lat, lng } = raw;
      if (keys.length !== 2 || !isFiniteNumber(lat) || !isFiniteNumber(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 720) {
        return null;
      }
      return { lat: Number(lat.toFixed(6)), lng: foldLongitude(lng) };
    }
    default:
      return null;
  }
}

/** True when a stored answer is a real answer (a correction alone stores `{}`). */
export function isGivenAnswer(question: Pick<QuizQuestion, "kind" | "options">, answer: unknown): boolean {
  return parseAnswer(question, answer) !== null;
}

/** The stored right answer, checked. Null when the stored value does not fit the type. */
export function readCorrect(question: Pick<QuizQuestion, "kind" | "options" | "correct">): CorrectValue | null {
  const value = question.correct;
  switch (question.kind) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < (question.options?.length ?? 0)
        ? value
        : null;
    case "waar_niet_waar":
      return typeof value === "boolean" ? value : null;
    case "echt_of_ai":
      return value === "echt" || value === "ai" ? value : null;
    case "schatting":
      return isFiniteNumber(value) ? value : null;
    case "kaart":
      return isRecord(value) && isFiniteNumber(value.lat) && isFiniteNumber(value.lng) && Math.abs(value.lat) <= 90
        ? { lat: value.lat, lng: value.lng }
        : null;
    default:
      return null;
  }
}

/** A stored question as quizScoring reads it. */
export function toScoringQuestion(question: QuizQuestion): Question | null {
  const correct = readCorrect(question);
  if (correct === null) return null;
  if (isChoiceType(question.kind)) return { type: question.kind, correct: { choice: correct as number } };
  switch (question.kind) {
    case "waar_niet_waar":
      return { type: "waar_niet_waar", correct: { bool: correct as boolean } };
    case "echt_of_ai":
      return { type: "echt_of_ai", correct: { realOrAi: correct as "echt" | "ai" } };
    case "schatting":
      return { type: "schatting", correct: { number: correct as number } };
    case "kaart": {
      if (!isMapScale(question.scale)) return null;
      const place = correct as { lat: number; lng: number };
      return { type: "kaart", correct: { lat: place.lat, lng: place.lng, scale: question.scale } };
    }
    default:
      return null;
  }
}

/** The most a team can score on this question, in whole points: 3 for a map, else 1. */
export function maxPointsFor(question: Pick<QuizQuestion, "kind">): number {
  return question.kind === "kaart" ? 3 : 1;
}

export type StoredAnswer = { answer: unknown; overrideTwelfths: number | null };

export type TeamScore = QuestionScore & {
  /** The points as computed, before a correction. */
  computed: number;
  /** A correction by the quizmaster, which wins over the computed points. */
  override: number | null;
  answer: Answer | null;
};

/**
 * Points per team for one question: quizScoring on the answers given, and
 * a correction by the quizmaster on top (it replaces the computed points).
 * Every team in `teamIds` is in the output.
 */
export function scoreTeams(
  question: QuizQuestion,
  stored: Readonly<Record<string, StoredAnswer | undefined>>,
  teamIds: readonly string[],
): Record<string, TeamScore> {
  const answers: Record<string, Answer | undefined> = {};
  for (const team of teamIds) {
    const row = Object.hasOwn(stored, team) ? stored[team] : undefined;
    answers[team] = row ? (parseAnswer(question, row.answer) ?? undefined) : undefined;
  }
  const scoring = toScoringQuestion(question);
  const computed = scoring ? scoreQuestion(scoring, answers) : {};
  const result: Record<string, TeamScore> = {};
  for (const team of teamIds) {
    const base: QuestionScore = Object.hasOwn(computed, team) ? computed[team] : { twelfths: 0, correct: false };
    const row = Object.hasOwn(stored, team) ? stored[team] : undefined;
    const override = row && isFiniteNumber(row.overrideTwelfths) ? row.overrideTwelfths : null;
    const twelfths = override ?? base.twelfths;
    result[team] = {
      ...base,
      twelfths,
      correct: override === null ? base.correct : override > 0,
      computed: base.twelfths,
      override,
      answer: answers[team] ?? null,
    };
  }
  return result;
}

/** Points typed by the quizmaster ("1", "0,5", "-1") in twelfths, or null when it is not a number. */
export function parsePointsInput(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * TWELFTHS);
  return Number.isFinite(value) && Math.abs(value) <= 100 * TWELFTHS ? value || 0 : null;
}

/* ------------------------------------------------------------------------ */
/* Test teams that answer by themselves ("Nepteams antwoorden vanzelf").     */
/* ------------------------------------------------------------------------ */

/** A plausible guess: right about half of the time, and estimates and pins near the truth. */
export function botAnswer(question: QuizQuestion, random: () => number = Math.random): Answer | null {
  const correct = readCorrect(question);
  const pickRight = random() < 0.5;
  switch (question.kind) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik": {
      const count = question.options?.length ?? 0;
      if (count === 0) return null;
      if (pickRight && typeof correct === "number") return { choice: correct };
      return { choice: Math.min(count - 1, Math.floor(random() * count)) };
    }
    case "waar_niet_waar":
      return { bool: pickRight && typeof correct === "boolean" ? correct : random() < 0.5 };
    case "echt_of_ai":
      return { realOrAi: pickRight && (correct === "echt" || correct === "ai") ? correct : random() < 0.5 ? "echt" : "ai" };
    case "schatting": {
      const target = typeof correct === "number" ? correct : 10;
      const factor = 0.6 + random() * 0.8;
      const guess = target * factor;
      return { number: Math.abs(guess) >= 20 ? Math.round(guess) : Number(guess.toFixed(1)) };
    }
    case "kaart": {
      const place = correct !== null && typeof correct === "object" ? (correct as { lat: number; lng: number }) : { lat: 52.1, lng: 5.3 };
      // Up to about 40 km off in the Netherlands, up to about 900 km in the world.
      const spread = question.scale === "wereld" ? 8 : 0.35;
      const lat = Math.max(-89, Math.min(89, place.lat + (random() * 2 - 1) * spread));
      return { lat: Number(lat.toFixed(5)), lng: foldLongitude(place.lng + (random() * 2 - 1) * spread * 1.6) };
    }
    default:
      return null;
  }
}
