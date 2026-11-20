/**
 * Time helpers. Everything the family sees is in Europe/Amsterdam, whatever
 * the time zone of the phone or the server.
 */
export const TIME_ZONE = "Europe/Amsterdam";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Wall-clock parts of an instant, as seen in Amsterdam. */
export function amsterdamParts(date: Date): Parts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of Amsterdam from UTC at the given instant, in minutes (60 or 120). */
export function amsterdamOffsetMinutes(date: Date): number {
  const p = amsterdamParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant at which the Amsterdam wall clock shows the given time.
 * In the spring-forward gap (02:00–03:00 does not exist) the later offset
 * is used, so 02:30 becomes 03:30 summer time.
 */
export function fromAmsterdamWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = new Date(naive - amsterdamOffsetMinutes(new Date(naive)) * 60000);
  const offset = amsterdamOffsetMinutes(firstGuess);
  return new Date(naive - offset * 60000);
}

/** Parse `YYYY-MM-DD` + `HH:MM` (as entered in a form) as Amsterdam time. */
export function parseAmsterdamInput(dateText: string, timeText: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = fromAmsterdamWallTime(year, month, day, hour, minute);
  // Reject dates like 31 February that roll over into the next month.
  const check = amsterdamParts(result);
  if (check.year !== year || check.month !== month || check.day !== day) return null;
  return result;
}

/** Values for `<input type="date">` and `<input type="time">`. */
export function toAmsterdamInput(date: Date): { date: string; time: string } {
  const p = amsterdamParts(date);
  const two = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` };
}

const weekdayLong = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "short" });
const monthLong = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, month: "long" });
const timeShort = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function shortWeekday(date: Date): string {
  return weekdayShort.format(date).replace(".", "");
}

/** "14:00" */
export function formatTime(date: Date): string {
  return timeShort.format(date);
}

/*
 * The short date formats below use non-breaking spaces, so a date or time
 * never falls apart over two lines ("6 / mei", "mei, / 14:00").
 */

/** "donderdag 6 mei, 14:00", always on one line. */
export function formatDayAndTime(date: Date): string {
  const p = amsterdamParts(date);
  return `${weekdayLong.format(date)}\u00a0${p.day}\u00a0${monthLong.format(date)},\u00a0${formatTime(date)}`;
}

/** "donderdag 6 mei 2027 om 14:00", for the admin. */
export function formatFull(date: Date): string {
  const p = amsterdamParts(date);
  return `${weekdayLong.format(date)} ${p.day} ${monthLong.format(date)} ${p.year} om ${formatTime(date)}`;
}

/** "1 april" */
export function formatDayMonth(date: Date): string {
  const p = amsterdamParts(date);
  return `${p.day} ${monthLong.format(date)}`;
}

/**
 * "do 6 t/m zo 9 mei", or "do 30 apr t/m zo 3 mei" across months. If it
 * does not fit, it only breaks around "t/m".
 */
export function formatDateRange(start: Date, end: Date): string {
  const a = amsterdamParts(start);
  const b = amsterdamParts(end);
  const startText = `${shortWeekday(start)} ${a.day}`;
  const endText = `${shortWeekday(end)} ${b.day} ${monthLong.format(end)}`;
  if (a.year === b.year && a.month === b.month) {
    if (a.day === b.day) return endText;
    return `${startText} t/m ${endText}`;
  }
  const shortMonth = monthLong.format(start).slice(0, 3);
  return `${startText} ${shortMonth} t/m ${endText}`;
}

/** "6 t/m 9 mei 2027" */
export function formatDateRangePlain(start: Date, end: Date): string {
  const a = amsterdamParts(start);
  const b = amsterdamParts(end);
  if (a.year === b.year && a.month === b.month) {
    return `${a.day} t/m ${b.day} ${monthLong.format(end)} ${b.year}`;
  }
  return `${a.day} ${monthLong.format(start)} t/m ${b.day} ${monthLong.format(end)} ${b.year}`;
}

export function amsterdamYear(date: Date): number {
  return amsterdamParts(date).year;
}
