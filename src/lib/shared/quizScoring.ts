/**
 * Points for quiz questions and quiz totals (SPEC §4.6 and §5.1). Pure
 * functions. Answers come from phones, so every shape is checked here: a
 * wrong shape scores 0 and nothing throws.
 *
 * From the quiz file (§9.2) to a `Question`:
 * - meerkeuze, wie_van_ons, schatting_bereik: `goed` (index) → `{ choice }`
 * - waar_niet_waar: `goed` (true or false) → `{ bool }`
 * - echt_of_ai: `goed` ("echt" or "ai") → `{ realOrAi }`
 * - schatting: `antwoord` (a number) → `{ number }`
 * - kaart: `antwoord` and `schaal` → `{ lat, lng, scale }`
 */
import { haversineKm, isMapScale, mapPoints, type LatLng, type MapScale } from "./geo";
import { JOKER_FACTOR, TWELFTHS } from "./scoring";

export type QuestionType =
  | "meerkeuze"
  | "waar_niet_waar"
  | "wie_van_ons"
  | "schatting"
  | "schatting_bereik"
  | "kaart"
  | "echt_of_ai";

/** meerkeuze, wie_van_ons and schatting_bereik: the index of the tile (0–3). */
export type ChoiceAnswer = { choice: number };
/** waar_niet_waar */
export type BoolAnswer = { bool: boolean };
/** echt_of_ai */
export type RealOrAiAnswer = { realOrAi: "echt" | "ai" };
/** schatting */
export type NumberAnswer = { number: number };
/** kaart: where the captain put the pin. */
export type MapAnswer = LatLng;

export type Answer = ChoiceAnswer | BoolAnswer | RealOrAiAnswer | NumberAnswer | MapAnswer;

export type Question =
  | { type: "meerkeuze" | "wie_van_ons" | "schatting_bereik"; correct: ChoiceAnswer }
  | { type: "waar_niet_waar"; correct: BoolAnswer }
  | { type: "echt_of_ai"; correct: RealOrAiAnswer }
  | { type: "schatting"; correct: NumberAnswer }
  | { type: "kaart"; correct: MapAnswer & { scale: MapScale } };

export type QuestionScore = {
  /** 12 for a correct answer, 0 to 36 for a map question. */
  twelfths: number;
  /** Right answer, closest estimate, or a pin worth at least 1 point. */
  correct: boolean;
  /** kaart: distance of the pin to the right place. */
  distanceKm?: number;
  /** schatting: distance of the estimate to the right number. */
  difference?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readChoice(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const { choice } = value;
  return typeof choice === "number" && Number.isInteger(choice) && choice >= 0 ? choice : null;
}

function readBool(value: unknown): boolean | null {
  return isRecord(value) && typeof value.bool === "boolean" ? value.bool : null;
}

function readRealOrAi(value: unknown): "echt" | "ai" | null {
  if (!isRecord(value)) return null;
  return value.realOrAi === "echt" || value.realOrAi === "ai" ? value.realOrAi : null;
}

function readNumber(value: unknown): number | null {
  return isRecord(value) && isFiniteNumber(value.number) ? value.number : null;
}

/** Any longitude is fine (a map that scrolled past 180° gives 185), latitude must exist. */
function readPoint(value: unknown): LatLng | null {
  if (!isRecord(value)) return null;
  const { lat, lng } = value;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || Math.abs(lat) > 90) return null;
  return { lat, lng };
}

/** Decimals of a number as typed: 7.25 → 2, 1.5e-7 → 8, 1e21 → 0. */
function decimals(value: number): number {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const fraction = mantissa.split(".")[1] ?? "";
  return Math.max(0, fraction.length - Number(exponent));
}

/**
 * |guess − target| at the decimals the numbers were typed with. Floating
 * point alone says 7.6 − 7.4 < 7.4 − 7.2, which would break a fair tie.
 */
function difference(guess: number, target: number): number {
  const places = Math.min(20, Math.max(decimals(guess), decimals(target)));
  return Number(Math.abs(guess - target).toFixed(places));
}

/**
 * Points per team for one question (§4.6 "Vraagtypes"). The output has an
 * entry for every key of `answers`; a team without an answer, or with an
 * answer of the wrong shape, gets 0.
 *
 * - A correct answer is worth 12 twelfths (1 point).
 * - schatting: every team at the smallest distance gets 12, so equal
 *   distances all score. Teams without an answer never score.
 * - kaart: `mapPoints × 12` by the haversine distance (§5.4).
 */
export function scoreQuestion(
  question: Question,
  answers: Readonly<Record<string, Answer | undefined>>,
): Record<string, QuestionScore> {
  const teams = isRecord(answers) ? Object.keys(answers) : [];
  const scores: Record<string, QuestionScore> = {};
  for (const team of teams) scores[team] = { twelfths: 0, correct: false };
  const right = (team: string) => {
    scores[team] = { twelfths: TWELFTHS, correct: true };
  };
  // The question comes from the database; do not trust its shape either.
  const q: unknown = question;
  if (!isRecord(q)) return scores;

  switch (q.type) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik": {
      const target = readChoice(q.correct);
      if (target !== null) for (const team of teams) if (readChoice(answers[team]) === target) right(team);
      return scores;
    }
    case "waar_niet_waar": {
      const target = readBool(q.correct);
      if (target !== null) for (const team of teams) if (readBool(answers[team]) === target) right(team);
      return scores;
    }
    case "echt_of_ai": {
      const target = readRealOrAi(q.correct);
      if (target !== null) for (const team of teams) if (readRealOrAi(answers[team]) === target) right(team);
      return scores;
    }
    case "schatting": {
      const target = readNumber(q.correct);
      if (target === null) return scores;
      const differences = new Map<string, number>();
      for (const team of teams) {
        const guess = readNumber(answers[team]);
        if (guess !== null) differences.set(team, difference(guess, target));
      }
      const best = Math.min(...differences.values());
      for (const [team, distance] of differences) {
        const closest = distance === best;
        scores[team] = { twelfths: closest ? TWELFTHS : 0, correct: closest, difference: distance };
      }
      return scores;
    }
    case "kaart": {
      const target = readPoint(q.correct);
      const scale = isRecord(q.correct) ? q.correct.scale : undefined;
      if (target === null || !isMapScale(scale)) return scores;
      for (const team of teams) {
        const pin = readPoint(answers[team]);
        if (pin === null) continue;
        const distanceKm = haversineKm(pin, target);
        const points = mapPoints(distanceKm, scale);
        scores[team] = { twelfths: points * TWELFTHS, correct: points > 0, distanceKm };
      }
      return scores;
    }
    default:
      return scores;
  }
}

/** Points per team for a round: the sum of its question scores, in twelfths. */
export function roundPoints(scores: readonly Readonly<Record<string, QuestionScore>>[]): Record<string, number> {
  const points: Record<string, number> = {};
  for (const question of scores) {
    for (const [team, score] of Object.entries(question)) {
      points[team] = (points[team] ?? 0) + (isFiniteNumber(score?.twelfths) ? score.twelfths : 0);
    }
  }
  return points;
}

export type QuizRound = {
  round: number;
  /** Points per team in this round, in twelfths, without joker. */
  points: Readonly<Record<string, number>>;
};

export type QuizRoundScore = {
  round: number;
  /** Points of the round without joker. */
  base: number;
  /** Points of the round as they count: doubled in the joker round. */
  twelfths: number;
  joker: boolean;
};

export type QuizTotal = {
  /** The quiz total in twelfths, joker included. */
  twelfths: number;
  /** The round the team played its joker on, or null. */
  jokerRound: number | null;
  /** Per round, in the order of `rounds`. */
  rounds: QuizRoundScore[];
};

/**
 * Quiz totals (§4.6 "Joker in de quiz"): the sum of all rounds, with all
 * points of the team's joker round doubled. `jokers` maps a team to the
 * round number of its joker. Every team with points or a joker is in the
 * output.
 */
export function quizTotals(
  rounds: readonly QuizRound[],
  jokers: Readonly<Record<string, number | undefined>>,
): Record<string, QuizTotal> {
  const teams = new Set<string>();
  for (const round of rounds) for (const team of Object.keys(round.points)) teams.add(team);
  for (const [team, round] of Object.entries(jokers)) if (isFiniteNumber(round)) teams.add(team);

  const totals: Record<string, QuizTotal> = {};
  for (const team of teams) {
    const jokerRound = Object.hasOwn(jokers, team) && isFiniteNumber(jokers[team]) ? jokers[team] : null;
    const scores = rounds.map((round) => {
      const points = Object.hasOwn(round.points, team) ? round.points[team] : 0;
      const base = isFiniteNumber(points) ? points : 0;
      const joker = round.round === jokerRound;
      return { round: round.round, base, twelfths: joker ? base * JOKER_FACTOR : base, joker };
    });
    totals[team] = {
      twelfths: scores.reduce((sum, score) => sum + score.twelfths, 0),
      jokerRound,
      rounds: scores,
    };
  }
  return totals;
}
