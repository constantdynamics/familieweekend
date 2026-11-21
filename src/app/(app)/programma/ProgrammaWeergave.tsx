"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { WeerRegel } from "@/components/home/Weer";
import { IconBloem, IconPijlVerder } from "@/components/ui/icons";
import { useNow } from "@/lib/client/clock";
import { useLive } from "@/lib/client/live";
import {
  dayKey,
  defaultDay,
  itemDetails,
  itemEnd,
  itemsOnDay,
  itemState,
  PROGRAM_LINKS,
  type ProgramItem,
  type ProgramView,
} from "@/lib/shared/program";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import { ProgrammaVolgt } from "./ProgrammaVolgt";

type Props = { initial: ProgramView; isAdmin: boolean; renderedAt: number };

/** The program, kept live: an admin change shows up on every phone. */
export function ProgrammaWeergave({ initial, isAdmin, renderedAt }: Props) {
  const { data } = useLive<ProgramView>("/api/programma", initial);
  const view = data ?? initial;
  if (!view.toon) return <ProgrammaVolgt />;
  return <ProgrammaLijst view={view} isAdmin={isAdmin} renderedAt={renderedAt} />;
}

function ProgrammaLijst({ view, isAdmin, renderedAt }: { view: ProgramView; isAdmin: boolean; renderedAt: number }) {
  const now = useNow(renderedAt, 30_000);
  const [chosen, setChosen] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const days = view.days;
  const active = days.some((day) => day.key === chosen) ? chosen! : defaultDay(days, now);
  const today = dayKey(now);

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: days.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + days.length) % days.length;
    setChosen(days[next].key);
    tabs.current[next]?.focus();
  }

  if (days.length === 0 || !active) {
    return <p className="mt-4 text-[15px] text-zand">Er staat nog niets in het programma.</p>;
  }
  const items = itemsOnDay(view.items, active);
  const activeDay = days.find((day) => day.key === active)!;

  return (
    <>
      {isAdmin && !view.familieZiet ? (
        <p className="m-0 mt-4 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4]">
          {bijElkaar("Alleen jij ziet het programma nu. De familie ziet het zodra je het vrijgeeft.", 0)}{" "}
          <Link href="/beheer/programma" className="font-bold underline underline-offset-4">
            Naar beheer
          </Link>
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Kies een dag"
        className="mt-4 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((day, index) => {
          const selected = day.key === active;
          return (
            <button
              key={day.key}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-${day.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-paneel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setChosen(day.key)}
              onKeyDown={(event) => onKey(event, index)}
              className={`flex min-h-14 flex-col items-center justify-center gap-px rounded-[16px] px-1 ${
                selected ? "bg-mosterd text-studio" : "bg-studio-licht text-beeldbuis"
              }`}
            >
              <span className="text-[16px] leading-tight font-extrabold">{day.short}</span>
              <span className="text-klein leading-tight">{day.date}</span>
              {day.key === today ? <span className="sr-only">, vandaag</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-paneel`} aria-labelledby={`${baseId}-${active}`} tabIndex={0} className="mt-3.5 flex flex-col gap-3">
        <h2 className="sr-only">{activeDay.long}</h2>
        <WeerRegel dag={active} now={now} />
        {items.length === 0 ? (
          <p className="m-0 px-1 text-[15px] text-zand">Op deze dag staat nog niets.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <Onderdeel key={item.id} item={item} all={view.items} now={now} isToday={active === today} />
            ))}
          </ol>
        )}
      </div>

      {isAdmin ? (
        <Link
          href="/beheer/programma"
          className="mt-5 inline-flex min-h-11 items-center self-start text-[15px] font-bold underline underline-offset-4"
        >
          Wijzig het programma
        </Link>
      ) : null}
    </>
  );
}

function Onderdeel({ item, all, now, isToday }: { item: ProgramItem; all: ProgramItem[]; now: number; isToday: boolean }) {
  const state = itemState(item, all, now);
  const nu = state === "nu";
  const dim = isToday && state === "voorbij";
  const mother = item.kind === "moederdag";
  const link = PROGRAM_LINKS[item.kind];
  const details = itemDetails(item);
  const end = item.endsAt ? itemEnd(item, all).end : null;

  const background = nu ? "bg-beeldbuis text-studio" : mother ? "bg-studio-licht" : "";
  const columns = link ? "grid-cols-[70px_minmax(0,1fr)_18px]" : "grid-cols-[70px_minmax(0,1fr)]";
  return (
    <li
      className={`relative grid ${columns} items-baseline gap-3 rounded-[18px] px-3.5 py-3 ${background} ${
        dim ? "opacity-70" : ""
      }`}
    >
      <span className="flex flex-col">
        <span className={`font-display text-[22px] leading-[1.1] ${nu ? "text-roest" : "text-mosterd"}`}>
          {formatTime(new Date(item.startsAt))}
        </span>
        {end ? <span className={`text-klein ${nu ? "text-studio" : "text-zand"}`}>tot {formatTime(new Date(end))}</span> : null}
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {mother ? <IconBloem size={20} /> : null}
          {link ? (
            <Link
              href={link.href}
              className="text-[17px] leading-[1.25] font-bold text-current no-underline after:absolute after:inset-0 after:rounded-[18px] after:content-['']"
            >
              {bijElkaar(item.title, 0)}
              <span className="sr-only">, {link.label}</span>
            </Link>
          ) : (
            <span className="text-[17px] leading-[1.25] font-bold">{bijElkaar(item.title, 0)}</span>
          )}
          {nu ? <span className="rounded-pil bg-studio px-2.5 py-0.5 text-klein font-bold text-beeldbuis">Nu</span> : null}
        </div>
        {details ? (
          <span className={`text-label leading-[1.35] ${nu ? "text-studio" : "text-zand"}`}>{bijElkaar(details, 0)}</span>
        ) : null}
      </div>
      {link ? <IconPijlVerder size={18} className={`self-center ${nu ? "text-studio" : "text-mosterd"}`} /> : null}
    </li>
  );
}
