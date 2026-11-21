/**
 * Fun facts (SPEC §4.2, §9.1 and §4.11): pure rules, shared by the phones and
 * the server. Checking an answer, the opening window, statistics per
 * question, draft quiz questions with three distractors, and the CSV export.
 * Nothing here talks to the database.
 */

export const FUNFACT_KINDS = ["ja_nee", "getal", "keuze", "open", "foto"] as const;
export type FunfactKind = (typeof FUNFACT_KINDS)[number];

export const KIND_LABELS: Record<FunfactKind, string> = {
  ja_nee: "Ja of nee",
  getal: "Getal",
  keuze: "Keuze",
  open: "Open vraag",
  foto: "Foto",
};

/** What is stored in funfact_answers.value, one shape per kind. */
export type FunfactValue =
  | { bool: boolean }
  | { number: number }
  | { choice: string }
  | { text: string }
  | { upload: string };

/** The parts of a question the rules need. */
export type QuestionShape = {
  id: string;
  kind: FunfactKind;
  text: string;
  options: string[] | null;
  min: number | null;
  max: number | null;
  quizForm: string | null;
};

export type AnswerShape = { value: FunfactValue | null; skipped: boolean };

/** Longest open answer, in characters. */
export const OPEN_MAX = 1000;
/** Limits for the question editor. */
export const QUESTION_MAX = 200;
export const OPTION_MAX = 60;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 10;
export const NUMBER_LIMIT = 1_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFunfactKind(value: unknown): value is FunfactKind {
  return typeof value === "string" && (FUNFACT_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------ */
/* Checking an answer                                                        */
/* ------------------------------------------------------------------------ */

export type ParsedValue = { ok: true; value: FunfactValue } | { ok: false; fout: string };

/** Remove control characters (except new lines and tabs) and trim. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/**
 * Check a value from a phone against the question and return a clean copy
 * (only the expected key). The upload of a photo answer is checked against
 * the database by the server.
 */
export function parseValue(question: QuestionShape, raw: unknown): ParsedValue {
  const fail = (fout: string): ParsedValue => ({ ok: false, fout });
  if (!isRecord(raw)) return fail("Dit antwoord kan de app niet lezen. Probeer het nog eens.");
  switch (question.kind) {
    case "ja_nee":
      return typeof raw.bool === "boolean" ? { ok: true, value: { bool: raw.bool } } : fail("Kies ja of nee.");
    case "getal": {
      const min = question.min ?? 0;
      const max = question.max ?? NUMBER_LIMIT;
      const number = raw.number;
      if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max) {
        return fail(`Kies een getal van ${formatNumber(min)} tot ${formatNumber(max)}.`);
      }
      return { ok: true, value: { number } };
    }
    case "keuze": {
      const choice = raw.choice;
      if (typeof choice !== "string" || !(question.options ?? []).includes(choice)) {
        return fail("Kies een van de antwoorden.");
      }
      return { ok: true, value: { choice } };
    }
    case "open": {
      if (typeof raw.text !== "string") return fail("Typ je antwoord, of sla de vraag over.");
      const text = cleanText(raw.text);
      if (!text) return fail("Typ je antwoord, of sla de vraag over.");
      if (text.length > OPEN_MAX) return fail(`Houd het korter dan ${formatNumber(OPEN_MAX)} tekens.`);
      return { ok: true, value: { text } };
    }
    case "foto":
      return typeof raw.upload === "string" && UUID.test(raw.upload)
        ? { ok: true, value: { upload: raw.upload.toLowerCase() } }
        : fail("Kies eerst een foto.");
  }
}

/** The id of the photo in an answer value, if it is a photo answer. */
export function uploadIdOf(value: unknown): string | null {
  return isRecord(value) && typeof value.upload === "string" ? value.upload : null;
}

/** Two stored answers are the same (so saving again is not needed). */
export function sameAnswer(a: AnswerShape | null | undefined, b: AnswerShape): boolean {
  if (!a) return false;
  if (a.skipped !== b.skipped) return false;
  return JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);
}

/* ------------------------------------------------------------------------ */
/* Showing an answer                                                         */
/* ------------------------------------------------------------------------ */

const numberFormat = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

/** "20.000", "7,4": Dutch digits with at most one decimal. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** An answer in words, for the person themself and for the admin. */
export function answerText(question: Pick<QuestionShape, "kind">, answer: AnswerShape | null | undefined): string {
  if (!answer) return "Nog niet ingevuld";
  if (answer.skipped || answer.value === null) return "Overgeslagen";
  const value = answer.value as Record<string, unknown>;
  if (typeof value.bool === "boolean") return value.bool ? "Ja" : "Nee";
  if (typeof value.number === "number") return formatNumber(value.number);
  if (typeof value.choice === "string") return value.choice;
  if (typeof value.text === "string") return value.text;
  if (typeof value.upload === "string") return "Foto";
  return question.kind === "foto" ? "Foto" : "Onbekend antwoord";
}

/* ------------------------------------------------------------------------ */
/* When the list is open                                                     */
/* ------------------------------------------------------------------------ */

export type FunfactsPhase = "voor" | "open" | "dicht";

/** Before the opening, open (the deadline itself still counts), or closed. Server time decides. */
export function funfactsPhase(openAt: string | Date, deadline: string | Date, now: number): FunfactsPhase {
  if (now < new Date(openAt).getTime()) return "voor";
  if (now > new Date(deadline).getTime()) return "dicht";
  return "open";
}

/** "32 van de 45 familieleden zijn klaar", with a friendlier line for none and all. */
export function doneCounterText(done: number, total: number): string {
  if (total <= 0) return "";
  if (done <= 0) return "Nog niemand is klaar. Wie is de eerste?";
  if (done >= total) return total === 1 ? "Iedereen is klaar!" : `Alle ${total} familieleden zijn klaar!`;
  return `${done} van de ${total} familieleden ${done === 1 ? "is" : "zijn"} klaar`;
}

/* ------------------------------------------------------------------------ */
/* Editing a question                                                        */
/* ------------------------------------------------------------------------ */

/** One option per line: trimmed, empty lines and duplicates dropped. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const option = raw.replace(/\s+/g, " ").trim();
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  return options;
}

/**
 * Options the admin renamed in place: same position, the old text is gone
 * and the new text is new. Answers with the old text follow the rename.
 * Reordering or adding options renames nothing.
 */
export function optionRenames(before: string[], after: string[]): Map<string, string> {
  const renames = new Map<string, string>();
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 1) {
    const oud = before[i];
    const nieuw = after[i];
    if (oud !== nieuw && !after.includes(oud) && !before.includes(nieuw)) renames.set(oud, nieuw);
  }
  return renames;
}

/* ------------------------------------------------------------------------ */
/* Statistics per question                                                   */
/* ------------------------------------------------------------------------ */

export type StatRow = { label: string; count: number; percent: number; outdated?: boolean };

export type NumberStats = { n: number; average: number; min: number; max: number; sum: number };

export type QuestionStats = {
  /** Answers with a value. */
  answered: number;
  skipped: number;
  /** ja_nee and keuze: one row per option, in the order of the question. */
  rows: StatRow[];
  /** getal */
  numbers: NumberStats | null;
};

function percent(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

/** Answers that really answer this kind of question. */
function validValues(question: QuestionShape, answers: AnswerShape[]): FunfactValue[] {
  const values: FunfactValue[] = [];
  for (const answer of answers) {
    if (answer.skipped || !answer.value) continue;
    const value = answer.value as Record<string, unknown>;
    const fits =
      (question.kind === "ja_nee" && typeof value.bool === "boolean") ||
      (question.kind === "getal" && typeof value.number === "number" && Number.isFinite(value.number)) ||
      (question.kind === "keuze" && typeof value.choice === "string") ||
      (question.kind === "open" && typeof value.text === "string") ||
      (question.kind === "foto" && typeof value.upload === "string");
    if (fits) values.push(answer.value);
  }
  return values;
}

/** Counts, percentages, average, highest and lowest (SPEC §4.11). */
export function questionStats(question: QuestionShape, answers: AnswerShape[]): QuestionStats {
  const values = validValues(question, answers);
  const skipped = answers.filter((a) => a.skipped).length;
  const answered = values.length;
  const stats: QuestionStats = { answered, skipped, rows: [], numbers: null };

  if (question.kind === "ja_nee") {
    const yes = values.filter((v) => (v as { bool: boolean }).bool).length;
    stats.rows = [
      { label: "Ja", count: yes, percent: percent(yes, answered) },
      { label: "Nee", count: answered - yes, percent: percent(answered - yes, answered) },
    ];
  } else if (question.kind === "keuze") {
    const counts = new Map<string, number>();
    for (const value of values) {
      const choice = (value as { choice: string }).choice;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
    }
    const options = question.options ?? [];
    stats.rows = options.map((label) => ({ label, count: counts.get(label) ?? 0, percent: percent(counts.get(label) ?? 0, answered) }));
    // Answers with an option that no longer exists still count, marked as old.
    for (const [label, count] of counts) {
      if (!options.includes(label)) stats.rows.push({ label, count, percent: percent(count, answered), outdated: true });
    }
  } else if (question.kind === "getal" && answered > 0) {
    const numbers = values.map((v) => (v as { number: number }).number);
    const sum = numbers.reduce((total, n) => total + n, 0);
    stats.numbers = {
      n: numbers.length,
      average: sum / numbers.length,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      sum,
    };
  }
  return stats;
}

/* ------------------------------------------------------------------------ */
/* Draft quiz questions                                                      */
/* ------------------------------------------------------------------------ */

/** A draft for a `meerkeuze` quiz question (the contract with the quiz). */
export type ConceptDraft = {
  text: string;
  /** 2 to 4 options. */
  options: string[];
  /** Index of the right option. */
  correct: number;
  explanation: string;
  /** Something the admin should look at, such as a tie. */
  note?: string;
};

export type ConceptResult = { ok: true; draft: ConceptDraft } | { ok: false; reason: string };

export type Aggregate = "som" | "gemiddelde" | "hoogste" | "laagste";

/** Which number the quiz form asks for, read from its wording. */
export function aggregateFor(quizForm: string): Aggregate {
  const text = quizForm.toLowerCase();
  if (/gemiddeld/.test(text)) return "gemiddelde";
  if (/record|hoogste|meeste|grootste|langste|verste/.test(text)) return "hoogste";
  if (/laagste|minste|kleinste|kortste/.test(text)) return "laagste";
  return "som";
}

/** A small, stable number from a text (the question id), to vary where the right answer sits. */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 1, 2 or 5 times a power of ten, at least `minimum`. */
function niceStep(raw: number, minimum: number): number {
  const value = Math.max(raw, minimum);
  const power = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 2, 5, 10].map((f) => f * power).find((step) => step >= value) ?? 10 * power;
  return Math.max(nice, minimum);
}

/**
 * The real value plus three evenly spaced distractors within [low, high],
 * sorted from low to high. Where the real value sits depends on the seed, so
 * it is not always the second option. Fewer options when the range is small.
 */
export function numberOptions(
  value: number,
  options: { low: number; high: number; decimals: 0 | 1; minStep?: number },
  seed: number,
): number[] {
  const { low, high, decimals } = options;
  const round = (n: number) => (decimals === 1 ? Math.round(n * 10) / 10 : Math.round(n));
  const step = niceStep(Math.abs(value) * 0.2, options.minStep ?? (decimals === 1 ? 0.5 : 1));
  const patterns = [
    [-3, -2, -1],
    [-2, -1, 1],
    [-1, 1, 2],
    [1, 2, 3],
  ];
  const fits = (n: number) => n >= low && n <= high;
  for (let attempt = 0; attempt < patterns.length; attempt += 1) {
    const pattern = patterns[(seed + attempt) % patterns.length];
    const candidates = pattern.map((k) => round(value + k * step));
    if (candidates.every(fits)) return [...candidates, round(value)].sort((a, b) => a - b);
  }
  // A narrow range (few answers): take the closest values that still fit.
  const near: number[] = [];
  for (let k = 1; near.length < 3 && k <= 50; k += 1) {
    for (const candidate of [round(value - k * step), round(value + k * step)]) {
      if (near.length < 3 && fits(candidate) && candidate !== round(value) && !near.includes(candidate)) near.push(candidate);
    }
  }
  return [...near, round(value)].sort((a, b) => a - b);
}

function concept(text: string, values: number[], value: number, suffix: string, explanation: string, note?: string): ConceptResult {
  const index = values.indexOf(value);
  if (values.length < 2 || index < 0) return { ok: false, reason: "Te weinig antwoorden voor een goede quizvraag." };
  return {
    ok: true,
    draft: {
      text,
      options: values.map((n) => `${formatNumber(n)}${suffix}`),
      correct: index,
      explanation,
      ...(note ? { note } : {}),
    },
  };
}

function wantsPercentage(text: string): boolean {
  return /percentage|procent/i.test(text);
}

/** The option named in the quiz form ("Welk percentage kiest koffie?" → "Koffie"). */
function optionNamedIn(text: string, options: string[]): string | null {
  const lower = text.toLowerCase();
  return options.find((option) => new RegExp(`(^|[^a-z])${option.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower)) ?? null;
}

function people(n: number): string {
  return n === 1 ? "familielid" : "familieleden";
}

/**
 * A draft quiz question from a fun fact (SPEC §4.11): the real answer and
 * three plausible distractors, e.g. "Hoeveel van ons hebben ooit iets
 * gebroken?" with the real count. Open questions and photos get no draft.
 */
export function conceptQuestion(question: QuestionShape, answers: AnswerShape[], seed = seedFrom(question.id)): ConceptResult {
  if (question.kind === "open") {
    return { ok: false, reason: "Bij een open vraag maak je de quizvraag zelf, met de antwoorden uit de export." };
  }
  if (question.kind === "foto") return { ok: false, reason: "Foto's gaan naar de ronde Echt of AI." };
  const values = validValues(question, answers);
  const n = values.length;
  if (n === 0) return { ok: false, reason: "Nog geen antwoorden." };
  const text = question.quizForm?.trim() || defaultQuizText(question);

  if (question.kind === "ja_nee") {
    const yes = values.filter((v) => (v as { bool: boolean }).bool).length;
    if (wantsPercentage(text)) {
      const pct = Math.round(percent(yes, n));
      return concept(
        text,
        numberOptions(pct, { low: 0, high: 100, decimals: 0, minStep: 5 }, seed),
        pct,
        "%",
        `${pct}% zei ja: ${yes} van de ${n} ${people(n)} die dit invulden.`,
      );
    }
    return concept(
      text,
      numberOptions(yes, { low: 0, high: n, decimals: 0 }, seed),
      yes,
      "",
      `${yes} van de ${n} ${people(n)} ${yes === 1 ? "zei" : "zeiden"} ja op de vraag: ${question.text}`,
    );
  }

  if (question.kind === "getal") {
    const numbers = values.map((v) => (v as { number: number }).number);
    const sum = numbers.reduce((total, x) => total + x, 0);
    const low = question.min ?? 0;
    const high = question.max ?? NUMBER_LIMIT;
    switch (aggregateFor(text)) {
      case "gemiddelde": {
        const average = Math.round((sum / n) * 10) / 10;
        return concept(
          text,
          numberOptions(average, { low, high, decimals: 1 }, seed),
          average,
          "",
          `Gemiddeld ${formatNumber(average)}, van ${n} ${people(n)} die dit invulden.`,
        );
      }
      case "hoogste": {
        const max = Math.max(...numbers);
        return concept(
          text,
          numberOptions(max, { low, high, decimals: 0 }, seed),
          max,
          "",
          `Het familierecord is ${formatNumber(max)}: het hoogste antwoord van ${n} ${people(n)}.`,
        );
      }
      case "laagste": {
        const min = Math.min(...numbers);
        return concept(
          text,
          numberOptions(min, { low, high, decimals: 0 }, seed),
          min,
          "",
          `Het laagste antwoord van ${n} ${people(n)} is ${formatNumber(min)}.`,
        );
      }
      case "som":
        return concept(
          text,
          numberOptions(sum, { low: Math.max(0, low * n), high: high * n, decimals: 0 }, seed),
          sum,
          "",
          `Samen ${formatNumber(sum)}, opgeteld over ${n} ${people(n)}.`,
        );
    }
  }

  // keuze
  const options = question.options ?? [];
  const counts = options.map((option) => values.filter((v) => (v as { choice: string }).choice === option).length);
  if (wantsPercentage(text) || /^\s*hoe\s?veel/i.test(text)) {
    const named = optionNamedIn(text, options);
    const target = named ?? (wantsPercentage(text) ? options[counts.indexOf(Math.max(...counts))] : options[0]);
    const count = counts[options.indexOf(target)] ?? 0;
    if (wantsPercentage(text)) {
      const pct = Math.round(percent(count, n));
      return concept(
        text,
        numberOptions(pct, { low: 0, high: 100, decimals: 0, minStep: 5 }, seed),
        pct,
        "%",
        `${pct}% koos ${target}: ${count} van de ${n} ${people(n)}.`,
      );
    }
    return concept(
      text,
      numberOptions(count, { low: 0, high: n, decimals: 0 }, seed),
      count,
      "",
      `${count} van de ${n} ${people(n)} ${count === 1 ? "koos" : "kozen"} ‘${target}’ bij de vraag: ${question.text}`,
    );
  }

  // Which option wins: the four most chosen, in the order of the question.
  const ranked = options
    .map((option, index) => ({ option, index, count: counts[index] }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
  const shown = ranked.slice(0, 4).sort((a, b) => a.index - b.index);
  const winner = ranked[0];
  if (!winner || shown.length < 2) return { ok: false, reason: "Te weinig antwoorden voor een goede quizvraag." };
  const tied = ranked.filter((r) => r.count === winner.count).map((r) => r.option);
  return {
    ok: true,
    draft: {
      text,
      options: shown.map((r) => r.option),
      correct: shown.findIndex((r) => r.option === winner.option),
      explanation: `${winner.option} kreeg de meeste stemmen: ${winner.count} van de ${n}.`,
      ...(tied.length > 1
        ? { note: `Gelijkspel: ${tied.join(" en ")} kregen er allebei ${winner.count}. Pas de vraag aan voor je hem overneemt.` }
        : {}),
    },
  };
}

/** A quiz text when the admin left the quiz form empty. */
export function defaultQuizText(question: QuestionShape): string {
  switch (question.kind) {
    case "ja_nee":
      return `Hoeveel van ons zeiden ja op de vraag: ${question.text}`;
    case "getal":
      return `${question.text} Hoeveel is dat voor ons allemaal samen?`;
    case "keuze":
      return `Welk antwoord kozen de meeste familieleden bij: ${question.text}`;
    default:
      return question.text;
  }
}

/* ------------------------------------------------------------------------ */
/* Export                                                                    */
/* ------------------------------------------------------------------------ */

/** One CSV cell: quoted when needed, and never read as a formula by a spreadsheet. */
export function csvCell(value: string | number | null | undefined, separator = ";"): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
  if (text.includes(separator) || /["\n\r]/.test(text) || /^\s|\s$/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Rows to CSV with a semicolon (what a Dutch spreadsheet expects, since the
 * comma is the decimal sign), Windows line ends and a BOM, so accents survive.
 */
export function toCsv(rows: (string | number | null)[][], separator = ";"): string {
  return `﻿${rows.map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join("\r\n")}\r\n`;
}

/** A safe, readable file name part: "Oma Riët" → "oma-riet". */
export function fileSlug(text: string, fallback = "foto"): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/**
 * Photos per zip download: each response stays under the 4.5 MB a Vercel
 * function may send in one go.
 */
export const ZIP_PART_BYTES = 4_000_000;

/** Split files into parts of at most `maxBytes` (one file larger than that gets its own part). */
export function splitIntoParts<T extends { size: number }>(files: T[], maxBytes: number): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const file of files) {
    if (current.length > 0 && size + file.size > maxBytes) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
