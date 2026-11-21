import { readFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { getWeatherReport, WEATHER_CACHE_MS } from "@/lib/server/weather";
import type { Settings } from "@/lib/server/settings";
import {
  announceDate,
  announceText,
  degrees,
  forWeekend,
  hoursToday,
  openMeteoUrl,
  parseOpenMeteo,
  rainText,
  weatherDescription,
  weatherIcon,
  weatherNow,
  weatherWindow,
} from "@/lib/shared/weather";
import { at, END, START } from "../support/voorbeeldprogramma";

const fixture: unknown = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../fixtures/open-meteo-weekend.json"), "utf8"),
);

describe("het antwoord van Open-Meteo", () => {
  it("leest nu, de uren en de dagen", () => {
    const forecast = parseOpenMeteo(fixture);
    expect(forecast).not.toBeNull();
    expect(forecast!.current).toEqual({ at: at(8, 11, 30), temperature: 18.8, code: 2, isDay: true });
    expect(forecast!.hours).toHaveLength(8 * 24);
    expect(forecast!.hours[0]).toMatchObject({ at: at(5, 0, 0), code: 3, isDay: false, rain: 30 });
    expect(forecast!.days.map((d) => d.date)).toContain("2027-05-08");
    expect(forecast!.days.find((d) => d.date === "2027-05-08")).toEqual({ date: "2027-05-08", code: 2, max: 19, min: 10, rain: 10 });
  });

  it("houdt alleen de dagen van het weekend over", () => {
    const weekend = forWeekend(parseOpenMeteo(fixture)!, START, END);
    expect(weekend.days.map((d) => d.date)).toEqual(["2027-05-06", "2027-05-07", "2027-05-08", "2027-05-09"]);
    expect(weekend.hours).toHaveLength(4 * 24);
  });

  it("slaat lege waarden over en weigert onzin", () => {
    const met = parseOpenMeteo({
      hourly: { time: ["2027-05-08T10:00", "2027-05-08T11:00"], temperature_2m: [null, 15], weather_code: [1, 1] },
      daily: { time: ["2027-05-08"], weather_code: [null], temperature_2m_max: [19], temperature_2m_min: [10] },
    });
    expect(met?.hours).toEqual([{ at: at(8, 11, 0), temperature: 15, code: 1, isDay: true, rain: null }]);
    expect(met?.days).toEqual([]);
    expect(parseOpenMeteo({ error: true, reason: "Ongeldige coördinaten" })).toBeNull();
    expect(parseOpenMeteo("hallo")).toBeNull();
    expect(parseOpenMeteo({ hourly: { time: "nee" } })).toBeNull();
  });

  it("vraagt alles in één keer, in Nederlandse tijd", () => {
    const url = new URL(openMeteoUrl("http://localhost:4000/", 51.2975, 5.4417));
    expect(url.origin + url.pathname).toBe("http://localhost:4000/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("51.2975");
    expect(url.searchParams.get("longitude")).toBe("5.4417");
    expect(url.searchParams.get("timezone")).toBe("Europe/Amsterdam");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("hourly")).toContain("precipitation_probability");
  });
});

describe("wanneer er een weerbericht is", () => {
  it("verschijnt het weerbericht veertien dagen vooraf: rond 22 april", () => {
    expect(announceDate(START)).toBe("2027-04-22");
    expect(announceText("2027-04-22")).toBe("22 april");
  });

  it("vraagt pas vanaf dan en tot het einde van het weekend", () => {
    expect(weatherWindow(Date.parse("2026-11-20T13:20:00Z"), START, END)).toBe("later");
    expect(weatherWindow(Date.parse("2027-04-21T21:59:00Z"), START, END)).toBe("later");
    expect(weatherWindow(Date.parse("2027-04-21T22:00:00Z"), START, END)).toBe("open");
    expect(weatherWindow(Date.parse(at(8, 11, 42)), START, END)).toBe("open");
    expect(weatherWindow(Date.parse(END), START, END)).toBe("voorbij");
  });
});

describe("het weer in woorden", () => {
  it("noemt het weer zoals op de radio", () => {
    expect(weatherDescription(0)).toBe("Zonnig");
    expect(weatherDescription(0, false)).toBe("Helder");
    expect(weatherDescription(2)).toBe("Licht bewolkt");
    expect(weatherDescription(63)).toBe("Regen");
    expect(weatherDescription(96)).toBe("Onweer met hagel");
    expect(weatherDescription(42)).toBe("Wisselend");
  });

  it("kiest het icoon, met een maan bij nacht", () => {
    expect(weatherIcon(0)).toBe("zon");
    expect(weatherIcon(0, false)).toBe("maan");
    expect(weatherIcon(2)).toBe("zon-wolk");
    expect(weatherIcon(2, false)).toBe("maan-wolk");
    expect(weatherIcon(3)).toBe("wolk");
    expect(weatherIcon(45)).toBe("mist");
    expect(weatherIcon(53)).toBe("regen");
    expect(weatherIcon(81)).toBe("regen");
    expect(weatherIcon(73)).toBe("sneeuw");
    expect(weatherIcon(86)).toBe("sneeuw");
    expect(weatherIcon(95)).toBe("onweer");
  });

  it("rondt graden af en zegt de kans op regen", () => {
    expect(degrees(18.8)).toBe("19°");
    expect(degrees(-0.4)).toBe("0°");
    expect(rainText(10)).toBe("10% kans op regen");
    expect(rainText(null)).toBeNull();
  });

  it("geeft het verloop van vandaag, om de twee uur", () => {
    const forecast = forWeekend(parseOpenMeteo(fixture)!, START, END);
    const now = Date.parse(at(8, 11, 42));
    expect(hoursToday(forecast.hours, now).map((h) => h.at)).toEqual([
      at(8, 12),
      at(8, 14),
      at(8, 16),
      at(8, 18),
      at(8, 20),
    ]);
    expect(hoursToday(forecast.hours, Date.parse(at(8, 22, 10)))).toEqual([at(8, 23)].map((a) => expect.objectContaining({ at: a })));
  });

  it("gebruikt de meting van nu, of anders de verwachting voor dit uur", () => {
    const forecast = forWeekend(parseOpenMeteo(fixture)!, START, END);
    expect(weatherNow(forecast, Date.parse(at(8, 11, 42)))?.temperature).toBe(18.8);
    const later = weatherNow(forecast, Date.parse(at(9, 10, 20)));
    expect(later).toMatchObject({ at: at(9, 10), code: 0 });
    expect(weatherNow({ ...forecast, hours: [] }, Date.parse(at(9, 10, 20)))).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
/* The server: Open-Meteo at most every 30 minutes, the last forecast offline. */
/* ------------------------------------------------------------------------ */

const SETTINGS: Settings = {
  startAt: START,
  endAt: END,
  locationName: "De Dommelvallei",
  locationPlace: "Borkel en Schaft",
  latitude: 51.2975,
  longitude: 5.4417,
  funfactsDeadline: "2027-04-01T21:59:59.000Z",
  funfactsOpenAt: "2026-12-31T23:00:00.000Z",
  programVisible: true,
  teamsVisible: true,
  zeskampPoints: [10, 7, 5, 3],
  intermezzoPoints: 1,
  intermezzoMaxDuels: null,
  boardOpen: true,
  fase2Live: true,
  realtime: null,
  updatedAt: "2026-11-20T12:00:00.000Z",
};

/** valk.weather_cache in memory: just the two queries the module runs. */
function fakeDatabase() {
  const store: { row: { fetched_at: Date; payload: unknown } | null } = { row: null };
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("select fetched_at, payload")) return Promise.resolve(store.row ? [store.row] : []);
    if (text.includes("insert into valk.weather_cache")) {
      store.row = { fetched_at: values[0] as Date, payload: (values[1] as { json: unknown }).json };
      return Promise.resolve([]);
    }
    return Promise.reject(new Error(`Onverwachte query: ${text}`));
  }) as unknown as postgres.Sql;
  (sql as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => ({ json: value });
  return { sql, store };
}

function openMeteo(answer: unknown = fixture, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(answer), { status, headers: { "Content-Type": "application/json" } }));
}

describe("het weer op de server", () => {
  const NOW = Date.parse(at(8, 11, 31));

  it("vraagt niets voor de verwachting er is", async () => {
    const fetcher = openMeteo();
    const report = await getWeatherReport(SETTINGS, { fetch: fetcher, sql: fakeDatabase().sql, now: Date.parse("2026-11-20T13:20:00Z") });
    expect(report).toMatchObject({ status: "later", announceDate: "2027-04-22", place: "Borkel en Schaft", days: [] });
    expect(fetcher).not.toHaveBeenCalled();
    const after = await getWeatherReport(SETTINGS, { fetch: fetcher, sql: fakeDatabase().sql, now: Date.parse(END) + 1 });
    expect(after.status).toBe("voorbij");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("haalt het weer op, bewaart het en vraagt binnen 30 minuten niet opnieuw", async () => {
    const { sql, store } = fakeDatabase();
    const fetcher = openMeteo();
    const first = await getWeatherReport(SETTINGS, { fetch: fetcher, sql, now: NOW });
    expect(first.status).toBe("ok");
    expect(first.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(first.days.map((d) => d.date)).toEqual(["2027-05-06", "2027-05-07", "2027-05-08", "2027-05-09"]);
    expect(first.current?.temperature).toBe(18.8);
    expect(store.row).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await getWeatherReport(SETTINGS, { fetch: fetcher, sql, now: NOW + WEATHER_CACHE_MS - 1000 });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await getWeatherReport(SETTINGS, { fetch: fetcher, sql, now: NOW + WEATHER_CACHE_MS + 1000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("houdt de laatst bekende stand als Open-Meteo onbereikbaar is", async () => {
    const { sql } = fakeDatabase();
    await getWeatherReport(SETTINGS, { fetch: openMeteo(), sql, now: NOW });
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const report = await getWeatherReport(SETTINGS, { fetch: offline, sql, now: NOW + 2 * WEATHER_CACHE_MS });
    expect(offline).toHaveBeenCalledTimes(1);
    expect(report.status).toBe("ok");
    expect(report.fetchedAt).toBe(new Date(NOW).toISOString());
  });

  it("zegt eerlijk dat er geen weer is als er nog niets bewaard is", async () => {
    const report = await getWeatherReport(SETTINGS, { fetch: openMeteo({ error: true }, 500), sql: fakeDatabase().sql, now: NOW });
    expect(report).toMatchObject({ status: "geen", fetchedAt: null, days: [] });
    const vreemd = await getWeatherReport(SETTINGS, { fetch: openMeteo({ iets: "anders" }), sql: fakeDatabase().sql, now: NOW });
    expect(vreemd.status).toBe("geen");
  });

  it("vraagt opnieuw als de plek verandert", async () => {
    const { sql } = fakeDatabase();
    const fetcher = openMeteo();
    await getWeatherReport(SETTINGS, { fetch: fetcher, sql, now: NOW });
    await getWeatherReport({ ...SETTINGS, latitude: 50.865, longitude: 5.832 }, { fetch: fetcher, sql, now: NOW + 1000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
