/**
 * Zeskamp games (SPEC §4.9): result types, modes, how values are checked and
 * how they read on screen. Pure functions, shared by the server, the
 * spelleider screen and the family screens.
 */
import { JOKER_FACTOR, rankResults, type Placement, type ResultType, type TeamResult } from "./scoring";

export type { ResultType };

export const RESULT_TYPES: readonly ResultType[] = [
  "tijd",
  "aantal_hoog",
  "aantal_laag",
  "meting_hoog",
  "meting_laag",
  "plaatsen",
  "jury",
];

/** How each result type reads in the app ("Op tijd, snelste wint"). */
export const RESULT_TYPE_LABELS: Record<ResultType, string> = {
  tijd: "Op tijd, snelste wint",
  aantal_hoog: "Tellen, meeste wint",
  aantal_laag: "Tellen, minste wint",
  meting_hoog: "Meten, hoogste wint",
  meting_laag: "Meten, laagste wint",
  plaatsen: "Volgorde aantikken",
  jury: "Jurycijfer, hoogste wint",
};

export type GameMode = "tegelijk" | "na_elkaar";

export const GAME_MODES: readonly GameMode[] = ["tegelijk", "na_elkaar"];

export const MODE_LABELS: Record<GameMode, string> = {
  tegelijk: "Alle teams tegelijk",
  na_elkaar: "Teams na elkaar",
};

export type GameStatus = "gepland" | "bezig" | "klaar";

export const STATUS_LABELS: Record<GameStatus, string> = {
  gepland: "Gepland",
  bezig: "Bezig",
  klaar: "Klaar",
};

export function isResultType(value: unknown): value is ResultType {
  return typeof value === "string" && (RESULT_TYPES as readonly string[]).includes(value);
}

export function isGameMode(value: unknown): value is GameMode {
  return value === "tegelijk" || value === "na_elkaar";
}

/** Counting types: whole numbers with + and − buttons. */
export function isCountType(type: ResultType): boolean {
  return type === "aantal_hoog" || type === "aantal_laag";
}

/** Measuring types: a number with a unit, typed in. */
export function isMeasureType(type: ResultType): boolean {
  return type === "meting_hoog" || type === "meting_laag";
}

/**
 * Places and points for one game, with every joker on it doubled. Several
 * teams may play their joker on the same game; `rankResults` takes one, so
 * the doubling happens here.
 */
export function rankGame(
  results: readonly TeamResult[],
  type: ResultType,
  table: readonly number[],
  jokers: readonly string[] = [],
): Placement[] {
  return rankResults(results, type, { table }).map((row) =>
    jokers.includes(row.team) ? { ...row, twelfths: row.twelfths * JOKER_FACTOR, joker: true } : row,
  );
}

const two = (n: number) => String(n).padStart(2, "0");

/** A stopwatch reading as "01:02,34" (minutes, seconds, hundredths), cut off like a real stopwatch. */
export function formatStopwatch(ms: number): string {
  const hundredths = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 10)) : 0;
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor(hundredths / 100) % 60;
  return `${two(minutes)}:${two(seconds)},${two(hundredths % 100)}`;
}

/** Milliseconds on the stopwatch to the seconds that are stored: hundredths, cut off. */
export function stopwatchSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 10)) / 100;
}

/** Stored seconds (hundredths) back to the stopwatch text. */
export function formatSeconds(seconds: number): string {
  return formatStopwatch(Math.round(seconds * 100) * 10);
}

/**
 * Read a typed time: "1:02,34", "62,34", "62.3" or "01:02". Returns seconds
 * in hundredths, or null when it is not a time.
 */
export function parseStopwatch(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  const match = /^(?:(\d{1,3}):)?(\d{1,5}(?:\.\d{1,2})?)$/.exec(clean);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (match[1] && seconds >= 60) return null;
  const total = Math.round((minutes * 60 + seconds) * 100) / 100;
  return total > 0 ? total : null;
}

/** "7,5" or "7.5" → 7.5. Not a plain number gives null. */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** 7.5 → "7,5"; at most `digits` decimals, no thousands separator. */
export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: digits, useGrouping: false }).format(value);
}

/** "1e", "2e". */
export function placeText(place: number): string {
  return `${place}e`;
}

/** How a stored value reads: "00:41,20", "12 ballen", "142 cm", "2e", "7,5". */
export function formatResultValue(type: ResultType, value: number, unit?: string | null): string {
  const suffix = unit?.trim() ? ` ${unit.trim()}` : "";
  switch (type) {
    case "tijd":
      return formatSeconds(value);
    case "plaatsen":
      return placeText(value);
    case "jury":
      return formatDecimal(value, 1);
    default:
      return `${formatDecimal(value, 2)}${suffix}`;
  }
}

/**
 * Round a value to what the referee sees, so equal results really are equal
 * (§5.2): times and measurements to hundredths, jury marks to tenths.
 */
export function roundResultValue(type: ResultType, value: number): number {
  switch (type) {
    case "tijd":
    case "meting_hoog":
    case "meting_laag":
      return Math.round(value * 100) / 100;
    case "jury":
      return Math.round(value * 10) / 10;
    default:
      return value;
  }
}

/** What is wrong with a value for this type, or null when it is fine. */
export function checkResultValue(type: ResultType, value: unknown, teamCount: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Dit is geen getal.";
  switch (type) {
    case "tijd":
      return value > 0 && value < 24 * 60 * 60 ? null : "Een tijd ligt tussen 0 seconden en een dag.";
    case "aantal_hoog":
    case "aantal_laag":
      return Number.isInteger(value) && value >= 0 && value <= 100_000 ? null : "Tel in hele getallen, vanaf 0.";
    case "meting_hoog":
    case "meting_laag":
      return value >= 0 && value <= 1_000_000 ? null : "Een meting is 0 of meer.";
    case "plaatsen":
      return Number.isInteger(value) && value >= 1 && value <= Math.max(1, teamCount)
        ? null
        : `Een plaats ligt tussen 1 en ${Math.max(1, teamCount)}.`;
    case "jury":
      return value >= 0 && value <= 10 ? null : "Een jurycijfer ligt tussen 0 en 10.";
  }
}

export const MAX_CARDS = 500;
export const MAX_CARD_LENGTH = 80;

/**
 * Cards for the game helper, pasted one per line: trimmed, without empty
 * lines, numbering or bullets, each card once, at most 500.
 */
export function parseCardList(text: string): string[] {
  const seen = new Set<string>();
  const cards: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const card = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CARD_LENGTH);
    if (!card) continue;
    const key = card.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
    if (cards.length >= MAX_CARDS) break;
  }
  return cards;
}

/** "10, 7, 5 en 3". */
export function pointsTableText(table: readonly number[]): string {
  const values = table.map((points) => formatDecimal(points, 1));
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} en ${values.at(-1)}`;
}

/** The rule under every game screen. */
export function pointsRule(table: readonly number[], type: ResultType): string {
  const places = `Plaats 1 tot ${table.length} geeft ${pointsTableText(table)} punten, de joker telt dubbel.`;
  const tie =
    type === "tijd"
      ? "Gelijke tijd? Dan delen de teams de punten van hun plaatsen."
      : "Gelijke uitslag? Dan delen de teams de punten van hun plaatsen.";
  return `${places} ${tie}`;
}
