/**
 * The weather (SPEC §4.10) from Open-Meteo: pure helpers to read its answer,
 * decide when a forecast makes sense and say it in Dutch. The server fetches
 * and caches; the phones only render.
 */
import { dayKey, shiftDay, startOfDay } from "./program";
import { formatDayMonth } from "./time";

/** The forecast for the weekend appears about this many days before it starts. */
export const FORECAST_LEAD_DAYS = 14;

export type WeatherIconKind = "zon" | "maan" | "zon-wolk" | "maan-wolk" | "wolk" | "mist" | "regen" | "sneeuw" | "onweer";

export type WeatherNow = { at: string; temperature: number; code: number; isDay: boolean };
export type WeatherHour = { at: string; temperature: number; code: number; isDay: boolean; rain: number | null };
export type WeatherDay = { date: string; code: number; max: number; min: number; rain: number | null };

export type Forecast = { current: WeatherNow | null; hours: WeatherHour[]; days: WeatherDay[] };

export type WeatherStatus =
  /** Too early: "Het weerbericht verschijnt rond 22 april." */
  | "later"
  | "ok"
  /** Open-Meteo could not be reached and nothing is stored yet. */
  | "geen"
  /** The weekend is over. */
  | "voorbij";

export type WeatherReport = Forecast & {
  status: WeatherStatus;
  /** "2027-04-22": from about this day on there is a forecast. */
  announceDate: string;
  /** Where the weather is for, e.g. "Borkel en Schaft". */
  place: string;
  /** When Open-Meteo gave this forecast (ISO), for "Bijgewerkt om 11:30". */
  fetchedAt: string | null;
};

/** The day from which the weekend forecast appears. */
export function announceDate(startAt: string): string {
  return shiftDay(dayKey(startAt), -FORECAST_LEAD_DAYS);
}

/** "22 april" */
export function announceText(date: string): string {
  return formatDayMonth(startOfDay(date));
}

export type WeatherWindow = "later" | "open" | "voorbij";

/** Whether asking Open-Meteo makes sense now. */
export function weatherWindow(now: number, startAt: string, endAt: string): WeatherWindow {
  if (now < startOfDay(announceDate(startAt)).getTime()) return "later";
  if (now >= Date.parse(endAt)) return "voorbij";
  return "open";
}

/** The days of the weekend, as day keys. */
export function weekendDayKeys(startAt: string, endAt: string): string[] {
  const keys: string[] = [];
  const last = dayKey(Math.max(Date.parse(startAt), Date.parse(endAt) - 1));
  for (let key = dayKey(startAt); key <= last && keys.length < 14; key = shiftDay(key, 1)) keys.push(key);
  return keys;
}

export function openMeteoUrl(base: string, latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: "temperature_2m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Europe/Amsterdam",
    past_days: "3",
    forecast_days: "16",
  });
  return `${base.replace(/\/+$/, "")}/v1/forecast?${params.toString()}`;
}

/** Only what the app shows: the hours and days of the weekend. */
export function forWeekend(forecast: Forecast, startAt: string, endAt: string): Forecast {
  const keys = new Set(weekendDayKeys(startAt, endAt));
  return {
    current: forecast.current,
    hours: forecast.hours.filter((hour) => keys.has(dayKey(hour.at))),
    days: forecast.days.filter((day) => keys.has(day.date)),
  };
}

const DESCRIPTIONS: Record<number, string> = {
  0: "Zonnig",
  1: "Overwegend zonnig",
  2: "Licht bewolkt",
  3: "Bewolkt",
  45: "Mist",
  48: "Mist met rijp",
  51: "Lichte motregen",
  53: "Motregen",
  55: "Dichte motregen",
  56: "IJzel",
  57: "IJzel",
  61: "Lichte regen",
  63: "Regen",
  65: "Zware regen",
  66: "IJzel",
  67: "IJzel",
  71: "Lichte sneeuw",
  73: "Sneeuw",
  75: "Zware sneeuw",
  77: "Korrelsneeuw",
  80: "Lichte buien",
  81: "Buien",
  82: "Zware buien",
  85: "Sneeuwbuien",
  86: "Zware sneeuwbuien",
  95: "Onweer",
  96: "Onweer met hagel",
  99: "Onweer met hagel",
};

/** WMO weather code in plain Dutch, as on the radio. */
export function weatherDescription(code: number, isDay = true): string {
  if (!isDay && code === 0) return "Helder";
  if (!isDay && code === 1) return "Overwegend helder";
  return DESCRIPTIONS[code] ?? "Wisselend";
}

export function weatherIcon(code: number, isDay = true): WeatherIconKind {
  if (code === 0) return isDay ? "zon" : "maan";
  if (code === 1 || code === 2) return isDay ? "zon-wolk" : "maan-wolk";
  if (code === 3) return "wolk";
  if (code === 45 || code === 48) return "mist";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "sneeuw";
  if (code >= 95) return "onweer";
  if (code >= 51 && code <= 82) return "regen";
  return "wolk";
}

/** "10% kans op regen" */
export function rainText(chance: number | null): string | null {
  if (chance === null) return null;
  return `${Math.round(chance)}% kans op regen`;
}

/** "19°" */
export function degrees(temperature: number): string {
  // `|| 0` turns -0 into 0.
  return `${Math.round(temperature) || 0}°`;
}

/** The hour that is going on now, for its chance of rain. */
export function hourAt(hours: readonly WeatherHour[], now: number): WeatherHour | null {
  let found: WeatherHour | null = null;
  for (const hour of hours) {
    if (Date.parse(hour.at) <= now) found = hour;
    else break;
  }
  return found;
}

/**
 * The course of today (SPEC §4.10): from the next whole hour, every other
 * hour, up to five moments, and only today.
 */
export function hoursToday(hours: readonly WeatherHour[], now: number, count = 5): WeatherHour[] {
  const today = dayKey(now);
  const upcoming = hours.filter((hour) => Date.parse(hour.at) > now && dayKey(hour.at) === today);
  return upcoming.filter((_, i) => i % 2 === 0).slice(0, count);
}

/** The current weather at `now`: the measured value, or else the forecast for this hour. */
export function weatherNow(forecast: Forecast, now: number): WeatherNow | null {
  const current = forecast.current;
  // A "current" value older than three hours says little about now.
  if (current && Math.abs(now - Date.parse(current.at)) < 3 * 60 * 60 * 1000) return current;
  const hour = hourAt(forecast.hours, now);
  if (hour && now - Date.parse(hour.at) < 60 * 60 * 1000) {
    return { at: hour.at, temperature: hour.temperature, code: hour.code, isDay: hour.isDay };
  }
  return null;
}
