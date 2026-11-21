import "server-only";
import type postgres from "postgres";
import { dayKey } from "@/lib/shared/program";
import {
  announceDate,
  forWeekend,
  openMeteoUrl,
  parseOpenMeteo,
  weatherWindow,
  type Forecast,
  type WeatherReport,
} from "@/lib/shared/weather";
import { db } from "./db";
import { logError } from "./log";
import type { Settings } from "./settings";

/**
 * The weather from Open-Meteo (SPEC §4.10): free and without a key, asked by
 * the server only, and kept 30 minutes in valk.weather_cache so 40 phones
 * cost one request. When Open-Meteo is unreachable, the last known forecast
 * stays in use (with its time). Before the forecast window nothing is asked.
 *
 * OPEN_METEO_URL points elsewhere for tests (a local fixture server).
 */
export const WEATHER_CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;

function baseUrl(): string {
  return process.env.OPEN_METEO_URL?.trim() || "https://api.open-meteo.com";
}

/** A forecast belongs to a place and a weekend; changing either asks anew. */
export function weatherCacheKey(settings: Pick<Settings, "latitude" | "longitude" | "startAt" | "endAt">): string {
  return `${settings.latitude.toFixed(4)},${settings.longitude.toFixed(4)}|${dayKey(settings.startAt)}|${dayKey(settings.endAt)}`;
}

type Cached = { key: string; fetchedAt: number; forecast: Forecast };

async function readCache(sql: postgres.Sql): Promise<Cached | null> {
  const [row] = await sql<{ fetched_at: Date; payload: { key?: unknown; forecast?: unknown } }[]>`
    select fetched_at, payload from valk.weather_cache where id = 1
  `;
  if (!row || typeof row.payload?.key !== "string" || !row.payload.forecast) return null;
  return { key: row.payload.key, fetchedAt: row.fetched_at.getTime(), forecast: row.payload.forecast as Forecast };
}

async function writeCache(sql: postgres.Sql, cached: Cached): Promise<void> {
  const payload = { key: cached.key, forecast: cached.forecast } as unknown as postgres.JSONValue;
  await sql`
    insert into valk.weather_cache (id, fetched_at, payload)
    values (1, ${new Date(cached.fetchedAt)}, ${sql.json(payload)})
    on conflict (id) do update set fetched_at = excluded.fetched_at, payload = excluded.payload
  `;
}

export type WeatherDeps = {
  fetch?: typeof fetch;
  sql?: postgres.Sql;
  now?: number;
};

async function askOpenMeteo(settings: Settings, fetcher: typeof fetch): Promise<Forecast | null> {
  try {
    const response = await fetcher(openMeteoUrl(baseUrl(), settings.latitude, settings.longitude), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Open-Meteo gaf ${response.status}`);
    const forecast = parseOpenMeteo(await response.json());
    if (!forecast) throw new Error("Open-Meteo gaf een onverwacht antwoord");
    return forWeekend(forecast, settings.startAt, settings.endAt);
  } catch (error) {
    logError("weer.ophalen", error);
    return null;
  }
}

/** Several requests at once (40 phones at 09:00) share one question to Open-Meteo. */
let inFlight: { key: string; promise: Promise<Forecast | null> } | null = null;

export async function getWeatherReport(settings: Settings, deps: WeatherDeps = {}): Promise<WeatherReport> {
  const now = deps.now ?? Date.now();
  const sql = deps.sql ?? db();
  const base: Omit<WeatherReport, "status"> = {
    announceDate: announceDate(settings.startAt),
    place: settings.locationPlace,
    fetchedAt: null,
    current: null,
    hours: [],
    days: [],
  };
  const report = (entry: Cached): WeatherReport => ({
    ...base,
    status: "ok",
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
    ...entry.forecast,
  });
  const window = weatherWindow(now, settings.startAt, settings.endAt);
  if (window === "later") return { status: "later", ...base };
  if (window === "voorbij") return { status: "voorbij", ...base };

  const key = weatherCacheKey(settings);
  let cached: Cached | null = null;
  try {
    cached = await readCache(sql);
  } catch (error) {
    logError("weer.cache.lezen", error);
  }
  const usable = cached && cached.key === key ? cached : null;
  if (usable && now - usable.fetchedAt < WEATHER_CACHE_MS) return report(usable);

  if (!inFlight || inFlight.key !== key) {
    const promise = askOpenMeteo(settings, deps.fetch ?? fetch);
    inFlight = { key, promise };
    void promise.finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  }
  const forecast = await inFlight.promise;
  if (forecast) {
    const fresh: Cached = { key, fetchedAt: now, forecast };
    try {
      await writeCache(sql, fresh);
    } catch (error) {
      logError("weer.cache.schrijven", error);
    }
    return report(fresh);
  }
  // Offline: the last known forecast, with its time.
  if (usable) return report(usable);
  return { status: "geen", ...base };
}
