import type { QuestionType } from "@/lib/server/quiz/types";

/** The question types in Dutch, for beheer. */
export const SOORT_LABEL: Record<QuestionType, string> = {
  meerkeuze: "Meerkeuze",
  waar_niet_waar: "Waar of niet waar",
  wie_van_ons: "Wie van ons?",
  schatting: "Schatting",
  schatting_bereik: "Schatting met bereiken",
  kaart: "Kaart",
  echt_of_ai: "Echt of AI",
};

export const SOORT_UITLEG: Record<QuestionType, string> = {
  meerkeuze: "2 tot 4 antwoorden, één is goed. 1 punt.",
  waar_niet_waar: "Twee grote tegels: waar of niet waar. 1 punt.",
  wie_van_ons: "2 tot 4 namen uit de deelnemerslijst, liefst één per team. 1 punt.",
  schatting: "De captain typt een getal. Het team dat er het dichtst bij zit, krijgt 1 punt.",
  schatting_bereik: "Antwoorden als 0–5 of 6–10, één is goed. 1 punt.",
  kaart: "De captain zet een speld. 0 tot 3 punten naar afstand.",
  echt_of_ai: "Een foto met de tegels Echt en AI. 1 punt.",
};
