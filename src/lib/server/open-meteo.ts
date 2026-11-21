import { z } from "zod";
import type { Forecast, WeatherDay, WeatherHour, WeatherNow } from "@/lib/shared/weather";
import { fromAmsterdamWallTime } from "@/lib/shared/time";

/*
 * Reading the Open-Meteo answer happens on the server only (and in tests),
 * so zod never ends up in the phone's JavaScript: it is big, and its speed
 * trick with eval trips the content security policy in the browser. Import
 * this module from server code only.
 */

const numbers = z.array(z.number().nullable());

const openMeteoSchema = z.object({
  current: z
    .object({ time: z.string(), temperature_2m: z.number(), weather_code: z.number(), is_day: z.number().optional() })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: numbers,
      weather_code: numbers,
      precipitation_probability: numbers.optional(),
      is_day: numbers.optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      weather_code: numbers,
      temperature_2m_max: numbers,
      temperature_2m_min: numbers,
      precipitation_probability_max: numbers.optional(),
    })
    .optional(),
});

/** "2027-05-08T11:30" in Amsterdam wall time (as Open-Meteo sends it with our time zone). */
function wallTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return fromAmsterdamWallTime(year, month, day, hour, minute);
}

function present(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read an Open-Meteo answer. Null when it is not what we asked for. */
export function parseOpenMeteo(json: unknown): Forecast | null {
  const parsed = openMeteoSchema.safeParse(json);
  if (!parsed.success) return null;
  const { current, hourly, daily } = parsed.data;
  if (!current && !hourly && !daily) return null;

  let now: WeatherNow | null = null;
  const nowAt = current ? wallTime(current.time) : null;
  if (current && nowAt) {
    now = {
      at: nowAt.toISOString(),
      temperature: current.temperature_2m,
      code: current.weather_code,
      isDay: current.is_day !== 0,
    };
  }

  const hours: WeatherHour[] = [];
  if (hourly) {
    hourly.time.forEach((time, i) => {
      const at = wallTime(time);
      const temperature = hourly.temperature_2m[i];
      const code = hourly.weather_code[i];
      if (!at || !present(temperature) || !present(code)) return;
      const rain = hourly.precipitation_probability?.[i];
      hours.push({
        at: at.toISOString(),
        temperature,
        code,
        isDay: hourly.is_day?.[i] !== 0,
        rain: present(rain) ? rain : null,
      });
    });
  }

  const days: WeatherDay[] = [];
  if (daily) {
    daily.time.forEach((date, i) => {
      const code = daily.weather_code[i];
      const max = daily.temperature_2m_max[i];
      const min = daily.temperature_2m_min[i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !present(code) || !present(max) || !present(min)) return;
      const rain = daily.precipitation_probability_max?.[i];
      days.push({ date, code, max, min, rain: present(rain) ? rain : null });
    });
  }

  return { current: now, hours, days };
}

