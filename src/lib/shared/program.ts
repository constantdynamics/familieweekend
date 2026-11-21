/**
 * The weekend program (SPEC §4.3): pure helpers for the program tab, the
 * "Nu bezig" and "Straks" blocks on Thuis and the admin form. Shared by the
 * server and the phones, and everything is in Europe/Amsterdam.
 *
 * Order: items are sorted by start time. `sort` only orders items that start
 * at the same moment (the admin moves those up and down).
 */
import { amsterdamParts, formatTime, fromAmsterdamWallTime, parseAmsterdamInput, TIME_ZONE } from "./time";

export const PROGRAM_KINDS = ["gewoon", "maaltijd", "moederdag", "quiz", "vrijdag", "zeskamp", "prijsuitreiking"] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export const PROGRAM_KIND_LABELS: Record<ProgramKind, string> = {
  gewoon: "Gewoon onderdeel",
  maaltijd: "Maaltijd",
  moederdag: "Moederdag",
  quiz: "Quiz",
  vrijdag: "Spelletjesmiddag",
  zeskamp: "Zeskamp",
  prijsuitreiking: "Prijsuitreiking",
};

/** The special kinds that open their own screen. */
export const PROGRAM_LINKS: Partial<Record<ProgramKind, { href: string; label: string }>> = {
  quiz: { href: "/quiz", label: "naar de quiz" },
  zeskamp: { href: "/zeskamp", label: "naar de zeskamp" },
  prijsuitreiking: { href: "/score", label: "naar het scorebord" },
};

export function isProgramKind(value: unknown): value is ProgramKind {
  return typeof value === "string" && (PROGRAM_KINDS as readonly string[]).includes(value);
}

export type ProgramItem = {
  id: string;
  /** ISO instant. */
  startsAt: string;
  /** ISO instant, or null: then the item runs until the next one starts. */
  endsAt: string | null;
  title: string;
  subtitle: string | null;
  location: string | null;
  kind: ProgramKind;
  sort: number;
};

/** What the Programma tab gets: the items and the day tabs. */
export type ProgramView = {
  /** This phone sees the program (released, or the admin). */
  toon: boolean;
  /** The family sees it too (for the admin's note). */
  familieZiet: boolean;
  items: ProgramItem[];
  days: ProgramDay[];
};

const NBSP = " ";
const DAY_MS = 24 * 60 * 60 * 1000;

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** The Amsterdam calendar day of an instant, as "2027-05-08". */
export function dayKey(moment: Date | number | string): string {
  const p = amsterdamParts(new Date(moment));
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

function keyParts(key: string): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number);
  return [year, month, day];
}

/** The day after `key` (or before, with a negative step), as a day key. */
export function shiftDay(key: string, days: number): string {
  const [year, month, day] = keyParts(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${two(shifted.getUTCMonth() + 1)}-${two(shifted.getUTCDate())}`;
}

/** Midnight at the start of the day, Amsterdam time. */
export function startOfDay(key: string): Date {
  const [year, month, day] = keyParts(key);
  return fromAmsterdamWallTime(year, month, day, 0, 0);
}

/** Whole calendar days from `fromKey` to `toKey` (negative when earlier). */
export function daysBetween(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = keyParts(fromKey);
  const [y2, m2, d2] = keyParts(toKey);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

const weekdayLong = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "short" });
const monthLong = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, month: "long" });

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type ProgramDay = {
  key: string;
  /** "Do" */
  short: string;
  /** "6 mei", on one line. */
  date: string;
  /** "donderdag" */
  weekday: string;
  /** "Donderdag 6 mei", on one line from the day number on. */
  long: string;
};

export function describeDay(key: string): ProgramDay {
  // Noon is safely inside the day, whatever the clock change does.
  const noon = new Date(startOfDay(key).getTime() + 12 * 60 * 60 * 1000);
  const [, , day] = keyParts(key);
  const weekday = weekdayLong.format(noon);
  const date = `${day}${NBSP}${monthLong.format(noon)}`;
  return {
    key,
    short: capitalise(weekdayShort.format(noon).replace(".", "")),
    date,
    weekday,
    long: `${capitalise(weekday)} ${date}`,
  };
}

/** "Zaterdag 8 mei" for an instant. */
export function formatLongDay(moment: Date | number): string {
  return describeDay(dayKey(moment)).long;
}

/** By start time; items that start together keep the admin's order. */
export function sortProgram(items: readonly ProgramItem[]): ProgramItem[] {
  return [...items].sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sort - b.sort || a.title.localeCompare(b.title, "nl"),
  );
}

/** At most this many day tabs, whatever the settings say. */
const MAX_DAYS = 14;

/**
 * The day tabs: every day of the weekend (start to end), plus any other day
 * that has an item. Normally do, vr, za and zo.
 */
export function programDays(items: readonly ProgramItem[], startAt: string, endAt: string): ProgramDay[] {
  const keys = new Set<string>();
  const first = dayKey(startAt);
  // An end at exactly midnight does not open a new day.
  const last = dayKey(Math.max(Date.parse(startAt), Date.parse(endAt) - 1));
  for (let key = first, n = 0; key <= last && n < MAX_DAYS; key = shiftDay(key, 1), n++) keys.add(key);
  for (const item of items) keys.add(dayKey(item.startsAt));
  return [...keys].sort().map(describeDay);
}

export function itemsOnDay(items: readonly ProgramItem[], key: string): ProgramItem[] {
  return sortProgram(items.filter((item) => dayKey(item.startsAt) === key));
}

export type ItemEnd = {
  /** Epoch ms. */
  end: number;
  /**
   * False for the last item of a day without an end time: it counts as
   * running until midnight, but nobody knows when it really stops, so no
   * remaining time is shown.
   */
  known: boolean;
};

/**
 * When an item ends: its own end time, otherwise the start of the next item
 * (SPEC §4.3), but never past midnight.
 */
export function itemEnd(item: ProgramItem, items: readonly ProgramItem[]): ItemEnd {
  const start = Date.parse(item.startsAt);
  if (item.endsAt) return { end: Date.parse(item.endsAt), known: true };
  const midnight = startOfDay(shiftDay(dayKey(start), 1)).getTime();
  let next = Infinity;
  for (const other of items) {
    const t = Date.parse(other.startsAt);
    if (t > start && t < next) next = t;
  }
  if (next <= midnight) return { end: next, known: true };
  return { end: midnight, known: false };
}

export type ItemState = "voorbij" | "nu" | "straks";

export function itemState(item: ProgramItem, items: readonly ProgramItem[], now: number): ItemState {
  if (Date.parse(item.startsAt) > now) return "straks";
  return now < itemEnd(item, items).end ? "nu" : "voorbij";
}

/** What is going on now: the item that started last of those still running. */
export function currentItem(items: readonly ProgramItem[], now: number): ProgramItem | null {
  let best: ProgramItem | null = null;
  for (const item of sortProgram(items)) {
    if (itemState(item, items, now) !== "nu") continue;
    if (!best || Date.parse(item.startsAt) > Date.parse(best.startsAt)) best = item;
  }
  return best;
}

/** The next items that have not started yet. */
export function nextItems(items: readonly ProgramItem[], now: number, count = 2): ProgramItem[] {
  return sortProgram(items)
    .filter((item) => Date.parse(item.startsAt) > now)
    .slice(0, count);
}

/** 0 to 1: how far along an item is. */
export function progressFraction(start: number, end: number, now: number): number {
  if (!(end > start)) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** "nog 18 minuten", "nog 1 uur en 5 minuten", "nog 2 uur". */
export function remainingText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `nog ${minutes} ${minutes === 1 ? "minuut" : "minuten"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `nog ${hours} uur`;
  return `nog ${hours} uur en ${rest} ${rest === 1 ? "minuut" : "minuten"}`;
}

/** The tab that opens first: today, else the first day. */
export function defaultDay(days: readonly ProgramDay[], now: number): string | null {
  const today = dayKey(now);
  if (days.some((day) => day.key === today)) return today;
  return days[0]?.key ?? null;
}

/** Day 1 is the day of the kick-off. */
export function weekendDayNumber(now: number, startAt: string): number {
  return daysBetween(dayKey(startAt), dayKey(now)) + 1;
}

/** "vandaag", "morgen", "gisteren" or the weekday, for an item seen from `now`. */
export function relativeDay(moment: number, now: number): string {
  const difference = daysBetween(dayKey(now), dayKey(moment));
  if (difference === 0) return "vandaag";
  if (difference === 1) return "morgen";
  if (difference === -1) return "gisteren";
  return describeDay(dayKey(moment)).weekday;
}

/**
 * "vanavond om 20:30", "vandaag om 10:30", "morgen om 9:00" or
 * "zaterdag om 20:30". The time never breaks off the rest.
 */
export function whenText(moment: number, now: number): string {
  const day = relativeDay(moment, now);
  const time = formatTime(new Date(moment));
  const evening = amsterdamParts(new Date(moment)).hour >= 18;
  const word = day === "vandaag" && evening ? "vanavond" : day;
  return `${word} om${NBSP}${time}`;
}

/** The text under an item: where, and what to know. */
export function itemDetails(item: Pick<ProgramItem, "location" | "subtitle">): string | null {
  const parts = [item.location, item.subtitle].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ------------------------------------------------------------------------ */
/* The admin form.                                                           */
/* ------------------------------------------------------------------------ */

export const PROGRAM_LIMITS = { title: 80, subtitle: 120, location: 60 } as const;

export type ProgramFormValues = {
  dag: string;
  begin: string;
  eind: string;
  titel: string;
  ondertitel: string;
  plek: string;
  soort: string;
};

export type ProgramInput = {
  startsAt: Date;
  endsAt: Date | null;
  title: string;
  subtitle: string | null;
  location: string | null;
  kind: ProgramKind;
};

export type ProgramFormResult =
  | { ok: true; input: ProgramInput }
  | { ok: false; velden: Partial<Record<keyof ProgramFormValues, string>> };

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Check what the admin typed. An end time before the start time means the
 * next night (a party until 01:00), as long as it is before 06:00.
 */
export function parseProgramForm(values: ProgramFormValues): ProgramFormResult {
  const velden: Partial<Record<keyof ProgramFormValues, string>> = {};
  const dag = values.dag.trim();
  const begin = values.begin.trim();
  const eind = values.eind.trim();
  const title = clean(values.titel);
  const subtitle = clean(values.ondertitel);
  const location = clean(values.plek);

  const dayValid = /^\d{4}-\d{2}-\d{2}$/.test(dag) && parseAmsterdamInput(dag, "12:00") !== null;
  if (!dayValid) velden.dag = "Kies een dag.";
  const startsAt = dayValid ? parseAmsterdamInput(dag, begin) : null;
  if (dayValid && !startsAt) velden.begin = "Vul een begintijd in, bijvoorbeeld 14:00.";

  let endsAt: Date | null = null;
  if (eind) {
    const sameDay = dayValid ? parseAmsterdamInput(dag, eind) : null;
    if (!sameDay) {
      if (dayValid) velden.eind = "Vul een geldige eindtijd in, of laat hem leeg.";
    } else if (startsAt) {
      if (sameDay.getTime() > startsAt.getTime()) endsAt = sameDay;
      else if (sameDay.getTime() < startsAt.getTime() && Number(eind.split(":")[0]) < 6) {
        endsAt = parseAmsterdamInput(shiftDay(dag, 1), eind);
      } else velden.eind = "Het einde moet na het begin liggen.";
    }
  }

  if (!title) velden.titel = "Geef het onderdeel een titel.";
  else if (title.length > PROGRAM_LIMITS.title) velden.titel = `Houd de titel korter dan ${PROGRAM_LIMITS.title} tekens.`;
  if (subtitle.length > PROGRAM_LIMITS.subtitle) {
    velden.ondertitel = `Houd de ondertitel korter dan ${PROGRAM_LIMITS.subtitle} tekens.`;
  }
  if (location.length > PROGRAM_LIMITS.location) velden.plek = `Houd de plek korter dan ${PROGRAM_LIMITS.location} tekens.`;
  const kind = values.soort.trim();
  if (!isProgramKind(kind)) velden.soort = "Kies een soort.";

  if (Object.keys(velden).length > 0 || !startsAt || !isProgramKind(kind)) return { ok: false, velden };
  return {
    ok: true,
    input: { startsAt, endsAt, title, subtitle: subtitle || null, location: location || null, kind },
  };
}
