/**
 * Answers and right answers as short Dutch text, for the quizmaster and the
 * reveal. Pure.
 */
import type { Answer } from "@/lib/shared/quizScoring";
import { readCorrect } from "./answers";
import type { CorrectValue, QuizQuestion } from "./types";

export const TILE_LETTERS = ["A", "B", "C", "D"] as const;

const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${number.format(Math.round(km * 1000))} m`;
  if (km < 10) return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(km)} km`;
  return `${number.format(Math.round(km))} km`;
}

function coordinate(value: number, positive: string, negative: string): string {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(Math.abs(value))}° ${value >= 0 ? positive : negative}`;
}

export function formatPlace(place: { lat: number; lng: number }): string {
  return `${coordinate(place.lat, "N", "Z")}, ${coordinate(place.lng, "O", "W")}`;
}

/** "B: 14", "Waar", "AI", "42 dagen", "51,3° N, 5,4° O". */
export function valueLabel(question: Pick<QuizQuestion, "kind" | "options" | "unit">, value: CorrectValue | Answer | null): string {
  if (value === null || value === undefined) return "geen antwoord";
  const record = typeof value === "object" ? (value as Record<string, unknown>) : null;
  switch (question.kind) {
    case "meerkeuze":
    case "wie_van_ons":
    case "schatting_bereik": {
      const index = typeof value === "number" ? value : Number(record?.choice);
      const option = question.options?.[index];
      return option === undefined ? "geen antwoord" : `${TILE_LETTERS[index] ?? "?"}: ${option}`;
    }
    case "waar_niet_waar": {
      const bool = typeof value === "boolean" ? value : record?.bool;
      return bool === true ? "Waar" : bool === false ? "Niet waar" : "geen antwoord";
    }
    case "echt_of_ai": {
      const choice = typeof value === "string" ? value : record?.realOrAi;
      return choice === "echt" ? "Echt" : choice === "ai" ? "AI" : "geen antwoord";
    }
    case "schatting": {
      const amount = typeof value === "number" ? value : Number(record?.number);
      if (!Number.isFinite(amount)) return "geen antwoord";
      return question.unit ? `${formatNumber(amount)} ${question.unit}` : formatNumber(amount);
    }
    case "kaart": {
      const lat = Number(record?.lat);
      const lng = Number(record?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? formatPlace({ lat, lng }) : "geen antwoord";
    }
    default:
      return "geen antwoord";
  }
}

/** The right answer of a question as text, for the console and the editor. */
export function correctLabel(question: QuizQuestion): string {
  const correct = readCorrect(question);
  if (correct === null) return "Nog geen goed antwoord ingesteld";
  const label = valueLabel(question, correct);
  return question.kind === "kaart" ? `${label} (${question.scale === "wereld" ? "wereld" : "nederland"})` : label;
}
