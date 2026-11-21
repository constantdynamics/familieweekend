"use client";

import { useId } from "react";
import { WeerIcoon } from "@/components/ui/icons-thuis";
import { dayKey, describeDay } from "@/lib/shared/program";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayMonth, formatTime } from "@/lib/shared/time";
import {
  announceText,
  degrees,
  hourAt,
  hoursToday,
  rainText,
  weatherDescription,
  weatherIcon,
  weatherNow,
  type WeatherReport,
} from "@/lib/shared/weather";
import { useGeheugen, useOphalen } from "./geheugen";

const NBSP = " ";
const TIEN_MINUTEN = 10 * 60 * 1000;

/** The weather report, fresh or else as this phone last saw it. */
export function useWeer() {
  const fresh = useOphalen<WeatherReport>("/api/weer", TIEN_MINUTEN);
  return useGeheugen<WeatherReport>("valk:weer", fresh.data, fresh.at);
}

/** "Bijgewerkt om 11:30." or, offline, the last known state with its time. */
function stamp(report: WeatherReport, now: number, offline: boolean): string | null {
  if (!report.fetchedAt) return null;
  const at = new Date(report.fetchedAt);
  const when = dayKey(at) === dayKey(now) ? `om${NBSP}${formatTime(at)}` : `op ${formatDayMonth(at)} om${NBSP}${formatTime(at)}`;
  return offline ? `Geen verbinding, laatst bijgewerkt ${when}.` : `Bijgewerkt ${when}.`;
}

/**
 * The weather card on Thuis during the weekend: now, the course of today and
 * the four days, as in the design reference.
 */
export function WeerKaart({ now }: { now: number }) {
  const titleId = useId();
  const { data: report, uitGeheugen } = useWeer();
  if (!report || report.status === "later" || report.status === "voorbij") return null;

  if (report.status === "geen") {
    return (
      <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
        {bijElkaar("Het weer is even niet op te halen. De app probeert het straks opnieuw.", 0)}
      </p>
    );
  }

  const current = weatherNow(report, now);
  const rain = rainText(hourAt(report.hours, now)?.rain ?? null);
  const description = current ? [weatherDescription(current.code, current.isDay), rain].filter(Boolean).join(", ") : null;
  const coming = hoursToday(report.hours, now);
  const today = dayKey(now);
  const footer = stamp(report, now, uitGeheugen);

  return (
    <section
      aria-labelledby={titleId}
      className="op-licht flex flex-col gap-2.5 rounded-kaart bg-beeldbuis px-[18px] py-3.5 text-studio shadow-kaart"
    >
      <h2 id={titleId} className="sr-only">
        Het weer in {report.place}
      </h2>
      {current ? (
        <div className="flex items-center gap-3.5">
          <WeerIcoon soort={weatherIcon(current.code, current.isDay)} size={50} className="flex-none" />
          <p className="m-0 flex-none font-display text-[44px] leading-none">
            <span className="sr-only">Nu </span>
            {degrees(current.temperature)}
          </p>
          {description ? <p className="m-0 min-w-0 text-[15px] leading-[1.35]">{bijElkaar(description, 0)}</p> : null}
        </div>
      ) : null}

      {coming.length >= 2 ? (
        <div className={current ? "border-t-2 border-zand pt-2.5" : ""}>
          <h3 className="sr-only">Vandaag</h3>
          <ol
            className="m-0 grid list-none gap-1 p-0"
            style={{ gridTemplateColumns: `repeat(${coming.length}, minmax(0, 1fr))` }}
          >
            {coming.map((hour) => {
              const time = formatTime(new Date(hour.at));
              return (
                <li key={hour.at} className="flex flex-col items-center gap-0.5">
                  <span aria-hidden="true" className="text-klein font-bold">
                    {time}
                  </span>
                  <WeerIcoon soort={weatherIcon(hour.code, hour.isDay)} size={24} />
                  <span aria-hidden="true" className="text-[15px]">
                    {degrees(hour.temperature)}
                  </span>
                  <span className="sr-only">
                    {time}: {weatherDescription(hour.code, hour.isDay).toLowerCase()}, {degrees(hour.temperature)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {report.days.length > 0 ? (
        <div className="border-t-2 border-zand pt-2.5">
          <h3 className="sr-only">Het weekend</h3>
          <ol
            className="m-0 grid list-none gap-1.5 p-0"
            style={{ gridTemplateColumns: `repeat(${Math.max(report.days.length, 4)}, minmax(0, 1fr))` }}
          >
            {report.days.map((day) => {
              const name = describeDay(day.date);
              const isToday = day.date === today;
              return (
                <li key={day.date} className="flex flex-col items-center gap-0.5">
                  <span aria-hidden="true" className="text-label font-bold">
                    {name.short}
                  </span>
                  <WeerIcoon soort={weatherIcon(day.code)} size={24} />
                  <span aria-hidden="true" className={`text-[15px] ${isToday ? "font-extrabold" : ""}`}>
                    {degrees(day.max)}
                  </span>
                  <span className="sr-only">
                    {isToday ? "Vandaag" : name.weekday}: {weatherDescription(day.code).toLowerCase()}, {degrees(day.min)} tot{" "}
                    {degrees(day.max)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {footer ? <p className="m-0 text-klein leading-[1.35]">{bijElkaar(footer, 0)}</p> : null}
    </section>
  );
}

/**
 * One line with the forecast for a day of the program, or when it will
 * appear: "Het weerbericht verschijnt rond 22 april." (SPEC §4.10).
 */
export function WeerRegel({ dag, now }: { dag: string; now: number }) {
  const { data: report, uitGeheugen } = useWeer();
  if (!report || report.status === "voorbij" || report.status === "geen") return null;

  let icon = weatherIcon(2);
  let text: string;
  if (report.status === "later") {
    text = `Het weerbericht verschijnt rond ${announceText(report.announceDate)}.`;
  } else {
    const day = report.days.find((entry) => entry.date === dag);
    if (!day) {
      text = "Het weerbericht voor deze dag volgt nog.";
    } else {
      icon = weatherIcon(day.code);
      const parts = [
        `${weatherDescription(day.code)}, ${Math.round(day.min) || 0} tot ${degrees(day.max)}`,
        rainText(day.rain),
      ].filter(Boolean);
      text = parts.join(", ");
      if (uitGeheugen) {
        const footer = stamp(report, now, true);
        if (footer) text = `${text}. ${footer}`;
      }
    }
  }

  return (
    <p className="m-0 flex items-center gap-3 rounded-[16px] bg-studio-licht px-3.5 py-2.5 text-[15px] leading-[1.35] text-beeldbuis">
      <WeerIcoon soort={icon} size={28} className="flex-none" />
      <span className="min-w-0">
        <span className="sr-only">Weer: </span>
        {bijElkaar(text, 0)}
      </span>
    </p>
  );
}
