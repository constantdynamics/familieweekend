/**
 * The fairness check of the quiz (SPEC §4.6 "Eerlijkheidscheck"). A question
 * may be known to one person ("Van wie is dit het lievelingsnummer?"), as
 * long as such questions are spread evenly over the teams. Pure functions.
 */
import type { QuestionType } from "./quizScoring";

/** A difference of more than this between two teams gives a warning. */
export const MAX_FAIR_DIFFERENCE = 1;

export type FairnessQuestion = {
  round: number;
  /** Participant ids with prior knowledge (the field `onderwerp`). */
  subjects: readonly string[];
};

export type FairnessCounts = {
  /** Questions with prior knowledge per team. */
  counts: Record<string, number>;
  min: number;
  max: number;
  /** True when max − min is more than `MAX_FAIR_DIFFERENCE`. */
  warning: boolean;
};

export type FairnessWarning = {
  /** The round, or null for the whole quiz. */
  round: number | null;
  /** Teams with the most and the fewest questions with prior knowledge. */
  most: string[];
  least: string[];
  difference: number;
};

export type FairnessReport = {
  /** Per round, in round order. */
  rounds: (FairnessCounts & { round: number })[];
  /** The whole quiz. */
  total: FairnessCounts;
  /** Every round with a warning, then the whole quiz if it has one. */
  warnings: FairnessWarning[];
  /** Subjects that are not in `teamOf`, for example after a typo in the quiz file. */
  unknownSubjects: string[];
};

function line(counts: Record<string, number>, teams: readonly string[]): FairnessCounts {
  const values = teams.map((team) => counts[team]);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  return { counts, min, max, warning: max - min > MAX_FAIR_DIFFERENCE };
}

function warningFor(round: number | null, counts: FairnessCounts, teams: readonly string[]): FairnessWarning {
  return {
    round,
    most: teams.filter((team) => counts.counts[team] === counts.max),
    least: teams.filter((team) => counts.counts[team] === counts.min),
    difference: counts.max - counts.min,
  };
}

/**
 * Counts per round and for the whole quiz how many questions give each team
 * prior knowledge. A question counts once for every team with at least one
 * subject in it: two subjects in the same team count once, subjects in two
 * teams count for both. `teamOf` maps a participant id to a team id; only
 * the teams in `teams` are counted.
 */
export function fairnessCheck(
  questions: readonly FairnessQuestion[],
  teamOf: Readonly<Record<string, string>>,
  teams: readonly string[],
): FairnessReport {
  const zero = () => Object.fromEntries(teams.map((team) => [team, 0]));
  const counted = new Set(teams);
  const perRound = new Map<number, Record<string, number>>();
  const total = zero();
  const unknown = new Set<string>();

  for (const question of questions) {
    const counts = perRound.get(question.round) ?? zero();
    perRound.set(question.round, counts);
    const hit = new Set<string>();
    for (const subject of question.subjects) {
      const team = Object.hasOwn(teamOf, subject) ? teamOf[subject] : undefined;
      if (team === undefined) unknown.add(subject);
      else if (counted.has(team)) hit.add(team);
    }
    for (const team of hit) {
      counts[team] += 1;
      total[team] += 1;
    }
  }

  const rounds = [...perRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, counts]) => ({ round, ...line(counts, teams) }));
  const whole = line(total, teams);
  const warnings = rounds.filter((round) => round.warning).map((round) => warningFor(round.round, round, teams));
  if (whole.warning) warnings.push(warningFor(null, whole, teams));
  return { rounds, total: whole, warnings, unknownSubjects: [...unknown] };
}

/**
 * What a question needs to fill in its subjects. Everything is a participant
 * id; the import maps the names of the quiz file (§9.2) to ids first.
 */
export type SubjectSource = {
  type: QuestionType;
  /** The answer options; for wie_van_ons each one names a participant. */
  options?: readonly { participantId?: string | null }[];
  /** The index of the right option (`goed` in the quiz file). */
  correct?: number | null;
  /** echt_of_ai: the participant who sent in the photo. */
  submitterId?: string | null;
  /** The `onderwerp` list as given. */
  subjects?: readonly string[] | null;
};

/**
 * The subjects of a question (§4.6): for wie_van_ons the participant of the
 * right option, for echt_of_ai the one who sent in the photo, and for every
 * type the subjects given by hand on top, without doubles.
 */
export function autoSubjects(question: SubjectSource): string[] {
  const subjects: string[] = [];
  if (question.type === "wie_van_ons" && typeof question.correct === "number") {
    const id = question.options?.[question.correct]?.participantId;
    if (id) subjects.push(id);
  }
  if (question.type === "echt_of_ai" && question.submitterId) subjects.push(question.submitterId);
  for (const subject of question.subjects ?? []) if (subject) subjects.push(subject);
  return [...new Set(subjects)];
}
