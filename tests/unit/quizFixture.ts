/**
 * A small quiz for the unit tests of the quiz engine: three rounds, of
 * which the second has no questions (and is skipped), the third is a
 * listening round with the intermezzo after it.
 */
import type { EngineState, QuizContent, QuizQuestion } from "@/lib/server/quiz/types";

let counter = 0;
const id = (prefix: string) => `${prefix}-${(counter += 1)}`;

export function question(partial: Partial<QuizQuestion> & Pick<QuizQuestion, "kind" | "text" | "correct">): QuizQuestion {
  return {
    id: id("q"),
    roundId: "r",
    sort: 1,
    extId: null,
    options: null,
    unit: null,
    scale: null,
    explanation: null,
    photoUploadId: null,
    photoCredit: null,
    subjects: [],
    note: null,
    ...partial,
  };
}

export const Q1 = question({
  id: "q1",
  kind: "meerkeuze",
  text: "Op welke dag valt Hemelvaartsdag altijd?",
  options: ["Maandag", "Woensdag", "Donderdag", "Zondag"],
  correct: 2,
  explanation: "Altijd op donderdag.",
  note: "Geheime notitie",
  subjects: ["Daan Proef"],
});

export const Q2 = question({
  id: "q2",
  kind: "kaart",
  text: "Waar ligt Valkenburg aan de Geul?",
  correct: { lat: 50.865, lng: 5.832 },
  scale: "nederland",
  photoUploadId: "00000000-0000-4000-8000-000000000001",
  photoCredit: "Illustratie",
});

export const Q3 = question({
  id: "q3",
  kind: "wie_van_ons",
  text: "Van wie is dit het lievelingsnummer?",
  options: ["Anna Proef", "Daan Proef", "Gijs Proef", "Jet Proef"],
  correct: 1,
  note: "Speel Dancing Queen",
});

export const CONTENT: QuizContent = {
  id: "quiz",
  title: "Proefquiz",
  isDemo: true,
  rounds: [
    { id: "r1", quizId: "quiz", number: 1, title: "Opwarmen", intro: "Even wennen.", listening: false, intermezzoAfter: false, maxPoints: 4, questions: [Q1, Q2] },
    { id: "r2", quizId: "quiz", number: 2, title: "Leeg", intro: null, listening: false, intermezzoAfter: false, maxPoints: 0, questions: [] },
    { id: "r3", quizId: "quiz", number: 3, title: "Muziek", intro: null, listening: true, intermezzoAfter: true, maxPoints: 1, questions: [Q3] },
  ],
};

export const REST: EngineState = {
  mode: "rust",
  quizId: "quiz",
  roundNo: null,
  questionId: null,
  phase: null,
  listening: false,
  countdownUntil: null,
};
