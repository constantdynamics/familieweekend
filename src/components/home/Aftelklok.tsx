"use client";

import { useSyncExternalStore } from "react";
import { countdownParts, countdownSentence, twoDigits } from "@/lib/shared/countdown";
import { formatDayAndTime } from "@/lib/shared/time";

/** Ticks on every whole second, and once more when the page becomes visible. */
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, 1000 - (Date.now() % 1000) + 8);
  };
  schedule();
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

type Props = {
  /** ISO time of the kick-off. */
  aftrap: string;
  /** When the server rendered this page; used for the first paint only. */
  renderedAt: number;
};

export function Aftelklok({ aftrap, renderedAt }: Props) {
  const target = Date.parse(aftrap);
  const now = useSyncExternalStore(subscribe, nowSeconds, () => Math.floor(renderedAt / 1000));
  const parts = countdownParts(target, now * 1000);
  const kickOff = formatDayAndTime(new Date(target));

  if (parts.done) {
    return (
      <section aria-label="Aftelklok" className="mt-[18px] rounded-kaart bg-studio-diep p-4 shadow-inzet">
        <p className="m-0 font-display text-[30px] leading-[1.1] schaduw-oranje">Het is zover!</p>
        <p className="mt-2 mb-0 text-[15px] text-zand">De Spelen zijn begonnen. Kijk in het programma wat er nu gebeurt.</p>
      </section>
    );
  }

  const units = [
    { value: String(parts.days), label: "dagen" },
    { value: twoDigits(parts.hours), label: "uur" },
    { value: twoDigits(parts.minutes), label: "min" },
    { value: twoDigits(parts.seconds), label: "sec", accent: true },
  ];

  return (
    <section aria-label="Aftelklok" className="mt-[18px] rounded-kaart bg-studio-diep p-4 shadow-inzet">
      <p className="m-0 mb-2.5 text-label font-medium text-zand">Nog te gaan tot de aftrap op {kickOff}</p>
      <p className="sr-only" role="timer">
        {countdownSentence({ ...parts, seconds: 0 })} tot de aftrap.
      </p>
      <div aria-hidden="true" className="grid grid-cols-4 gap-2">
        {units.map((unit) => (
          <div key={unit.label} className="flex flex-col items-stretch gap-1.5">
            <div
              className={`relative flex h-[76px] items-center justify-center overflow-hidden rounded-tegel shadow-tegel ${
                unit.accent ? "bg-mosterd" : "bg-beeldbuis"
              }`}
            >
              <span
                key={unit.value}
                className={`block font-display leading-none text-studio motion-safe:animate-kantel ${
                  unit.value.length >= 3 ? "text-[clamp(26px,8.7vw,34px)]" : "text-[34px]"
                }`}
              >
                {unit.value}
              </span>
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-studio opacity-[0.16]" />
            </div>
            <span className="text-center text-klein font-medium text-zand">{unit.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
