/**
 * Practising the quiz: the score of a run. Shared by the server and the
 * practice screen.
 */
import type { QuestionType } from "./quizScoring";
import { TWELFTHS } from "./scoring";

/**
 * The most one team can score on a question, in twelfths: 3 points for a
 * map question, 1 otherwise. An estimate scores for the closest team, and
 * alone you are always the closest: null, it does not count when practising.
 */
export function oefenMaximum(kind: QuestionType): number | null {
  if (kind === "schatting") return null;
  return kind === "kaart" ? 3 * TWELFTHS : TWELFTHS;
}
