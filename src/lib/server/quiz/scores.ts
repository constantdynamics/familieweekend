/**
 * Quiz totals and the interim standing (SPEC §4.6, §5.1) from what is
 * stored: the answers per question, the quizmaster's corrections and the
 * quiz jokers. Pure functions; store.ts loads the rows.
 */
import { quizTotals, roundPoints, type QuizRound as ScoringRound, type QuizTotal } from "@/lib/shared/quizScoring";
import { standings } from "@/lib/shared/scoring";
import { maxPointsFor, scoreTeams, type StoredAnswer, type TeamScore } from "./answers";
import type { QuizContent } from "./types";

/** Answers per question id, then per team id. */
export type AnswerBook = Readonly<Record<string, Readonly<Record<string, StoredAnswer>>>>;

export type QuizStanding = QuizTotal & {
  teamId: string;
  place: number;
  shared: boolean;
};

/** Points per question per team, corrections included (joker not included). */
export function scoreBook(content: QuizContent, answers: AnswerBook, teamIds: readonly string[]): Record<string, Record<string, TeamScore>> {
  const book: Record<string, Record<string, TeamScore>> = {};
  for (const round of content.rounds) {
    for (const question of round.questions) {
      const stored = Object.hasOwn(answers, question.id) ? answers[question.id] : {};
      book[question.id] = scoreTeams(question, stored, teamIds);
    }
  }
  return book;
}

/**
 * Totals per team with the joker round doubled, and places with "gedeeld"
 * for equal totals. `teamIds` in the order of the teams; equal totals keep
 * that order.
 */
export function quizStandings(
  content: QuizContent,
  answers: AnswerBook,
  jokers: Readonly<Record<string, number>>,
  teamIds: readonly string[],
): QuizStanding[] {
  const book = scoreBook(content, answers, teamIds);
  const rounds: ScoringRound[] = content.rounds.map((round) => ({
    round: round.number,
    points: roundPoints(round.questions.map((question) => book[question.id] ?? {})),
  }));
  const jokerMap: Record<string, number> = {};
  for (const team of teamIds) if (Object.hasOwn(jokers, team)) jokerMap[team] = jokers[team];
  const totals = quizTotals(rounds, jokerMap);
  const points: Record<string, number> = {};
  for (const team of teamIds) points[team] = totals[team]?.twelfths ?? 0;
  const ranked = standings(teamIds, [{ id: "quiz", kind: "quiz", countsForMedals: true, points }]);
  return ranked.map((row) => {
    const total = totals[row.team] ?? {
      twelfths: 0,
      jokerRound: Object.hasOwn(jokerMap, row.team) ? jokerMap[row.team] : null,
      rounds: content.rounds.map((round) => ({ round: round.number, base: 0, twelfths: 0, joker: false })),
    };
    return { ...total, teamId: row.team, place: row.place, shared: row.shared };
  });
}

/** The most a team can score in a round, in whole points (a map question is worth up to 3). */
export function roundMaxPoints(questions: readonly { kind: QuizContent["rounds"][number]["questions"][number]["kind"] }[]): number {
  return questions.reduce((sum, question) => sum + maxPointsFor(question), 0);
}

export type WeightWarning = { round: number; title: string; max: number; othersMax: number };

/**
 * Rounds with map questions that can bring more points than any round
 * without them (SPEC §4.11: "zodat de kaartronde niet ongemerkt zwaarder
 * telt"). Rounds without questions do not count.
 */
export function heavyMapRounds(content: QuizContent): WeightWarning[] {
  const rounds = content.rounds.filter((round) => round.questions.length > 0);
  const plain = rounds.filter((round) => !round.questions.some((question) => question.kind === "kaart"));
  if (plain.length === 0) return [];
  const othersMax = Math.max(...plain.map((round) => roundMaxPoints(round.questions)));
  return rounds
    .filter((round) => round.questions.some((question) => question.kind === "kaart"))
    .map((round) => ({ round: round.number, title: round.title, max: roundMaxPoints(round.questions), othersMax }))
    .filter((warning) => warning.max > warning.othersMax);
}
