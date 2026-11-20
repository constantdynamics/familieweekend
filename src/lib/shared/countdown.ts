export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the target moment has been reached. */
  done: boolean;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Split the time left until `targetMs` into days, hours, minutes and seconds. */
export function countdownParts(targetMs: number, nowMs: number): CountdownParts {
  let rest = Math.max(0, targetMs - nowMs);
  const done = rest === 0;
  // Round up to whole seconds, so the clock shows 00:00:01 until the very end.
  rest = Math.ceil(rest / SECOND) * SECOND;
  const days = Math.floor(rest / DAY);
  rest -= days * DAY;
  const hours = Math.floor(rest / HOUR);
  rest -= hours * HOUR;
  const minutes = Math.floor(rest / MINUTE);
  rest -= minutes * MINUTE;
  const seconds = Math.floor(rest / SECOND);
  return { days, hours, minutes, seconds, done };
}

export function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "Nog 167 dagen, 3 uur en 12 minuten" for screen readers. */
export function countdownSentence(parts: CountdownParts): string {
  if (parts.done) return "Het is zover!";
  const pieces: string[] = [];
  if (parts.days > 0) pieces.push(`${parts.days} ${parts.days === 1 ? "dag" : "dagen"}`);
  if (parts.hours > 0) pieces.push(`${parts.hours} uur`);
  if (parts.minutes > 0 || pieces.length === 0) {
    pieces.push(`${parts.minutes} ${parts.minutes === 1 ? "minuut" : "minuten"}`);
  }
  const text = pieces.length > 1 ? `${pieces.slice(0, -1).join(", ")} en ${pieces.at(-1)}` : pieces[0];
  return `Nog ${text}`;
}

export type WeekendPhase = "voor" | "tijdens" | "na";

export function weekendPhase(nowMs: number, startMs: number, endMs: number): WeekendPhase {
  if (nowMs < startMs) return "voor";
  if (nowMs < endMs) return "tijdens";
  return "na";
}
