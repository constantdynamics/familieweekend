"use client";

import Link from "next/link";
import { useId } from "react";
import { Bijgewerkt } from "@/components/pwa/AppSignalen";
import { TEAM_KLEUREN } from "@/components/team/TeamKleur";
import { IconPijlVerder, IconSlot } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import {
  headerLine,
  homeTiles,
  jokerLine,
  liveBanner,
  lockSentence,
  teamLine,
  type OwnTeam,
  type ThuisData,
} from "@/lib/shared/home";
import {
  currentItem,
  formatLongDay,
  itemDetails,
  itemEnd,
  nextItems,
  progressFraction,
  relativeDay,
  remainingText,
  type ProgramItem,
} from "@/lib/shared/program";
import { bijElkaar } from "@/lib/shared/tekst";
import { amsterdamParts, formatTime } from "@/lib/shared/time";
import { ThuisTegels } from "./ThuisTegels";
import { WeerKaart } from "./Weer";

export type WeekendInfo = {
  startAt: string;
  endAt: string;
  locationName: string;
  locationPlace: string;
  /** The family sees the new app (settings.fase2Live). */
  fase2Live: boolean;
};

type Props = {
  weekend: WeekendInfo;
  now: number;
  /** From /api/thuis, or what this phone remembers; null while loading. */
  data: ThuisData | null;
  /** When `data` arrived. */
  dataAt: number | null;
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Thuis during the weekend (SPEC §4.1): the day, a live banner when the quiz
 * or the ceremony runs, "Nu bezig" with the time left, "Straks", the tiles,
 * the weather, your team with its jokers and the lock of the scoreboard.
 */
export function ThuisTijdens({ weekend, now, data, dataAt }: Props) {
  const items = data?.programma ?? null;
  const banner = data ? liveBanner(data.live.mode) : null;
  const coming = items ? nextItems(items, now, 2) : [];
  const tiles = data ? homeTiles(items, now, data.live) : [];

  return (
    <Scherm spots="zacht">
      {dataAt ? <Bijgewerkt at={dataAt} /> : null}
      <SchermTitel sub={headerLine(now, weekend.startAt, items)}>
        <span className="sr-only">De Valkenburger Spelen, </span>
        {formatLongDay(now)}
      </SchermTitel>

      <div className="mt-4 flex flex-col gap-3.5">
        {banner ? (
          <div aria-live="polite">
            <Link
              href={banner.href}
              className="flex min-h-14 items-center gap-3 rounded-kaart bg-mosterd px-[18px] py-3 text-studio no-underline shadow-[0_6px_0_#9E6A0B] hover:text-studio active:translate-y-0.5"
            >
              <span aria-hidden="true" className="h-3 w-3 flex-none rounded-pil bg-studio" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[18px] leading-tight font-extrabold">{bijElkaar(banner.title, 0)}</span>
                <span className="text-label leading-[1.35] font-bold">{bijElkaar(banner.text, 0)}</span>
              </span>
              <IconPijlVerder size={22} className="flex-none" />
            </Link>
          </div>
        ) : null}

        {items ? <NuBezig items={items} now={now} /> : null}
        {coming.length > 0 ? <Straks items={coming} now={now} /> : null}
        <ThuisTegels tiles={tiles} />
        <WeerKaart now={now} />
        {data?.teams.map((team) => <TeamKaart key={team.id} team={team} />)}

        {data?.live.lockClosed ? (
          <p className="m-0 flex items-center gap-3 px-1 text-[15px] leading-[1.35]">
            <IconSlot size={22} className="flex-none text-mosterd" />
            <span>{bijElkaar(lockSentence(items, now), 0)}</span>
          </p>
        ) : null}

        {!data ? (
          <div aria-busy="true" className="flex flex-col gap-3.5">
            <span className="sr-only">Thuis laden…</span>
            <div className="h-[132px] rounded-kaart bg-studio-licht" />
            <div className="h-20 rounded-kaart bg-studio-licht" />
          </div>
        ) : null}
      </div>
    </Scherm>
  );
}

function NuBezig({ items, now }: { items: ProgramItem[]; now: number }) {
  const titleId = useId();
  const item = currentItem(items, now);
  if (!item) {
    const night = amsterdamParts(new Date(now)).hour < 6;
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-1 rounded-kaart bg-studio-licht px-[18px] py-4">
        <h2 id={titleId} className="m-0 text-[20px] leading-tight font-extrabold">
          Even niets op het programma
        </h2>
        <p className="m-0 text-[15px] leading-[1.4] text-zand">
          {night
            ? bijElkaar("Slaap lekker! Straks gaan we verder.", 0)
            : bijElkaar("Tijd voor een spelletje, een dutje of een praatje.", 0)}
        </p>
      </section>
    );
  }

  const start = Date.parse(item.startsAt);
  const { end, known } = itemEnd(item, items);
  const rest = known ? remainingText(end - now) : null;
  const where = item.location?.trim() || null;
  const line = where && rest ? `${where}, ${rest}` : (where ?? (rest ? capitalise(rest) : null));
  const progress = Math.round(progressFraction(start, end, now) * 100);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1.5 rounded-kaart bg-oranje px-[18px] py-4 text-studio shadow-[0_6px_0_#9E3E0B]"
    >
      <p className="m-0 flex items-center gap-2.5 text-label font-bold">
        <span aria-hidden="true" className="h-3 w-3 flex-none rounded-pil bg-studio" />
        Nu bezig
      </p>
      <h2 id={titleId} className="m-0 text-[24px] leading-[1.15] font-extrabold">
        {bijElkaar(item.title, 0)}
      </h2>
      {item.subtitle ? <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(item.subtitle, 0)}</p> : null}
      {line ? <p className="m-0 text-[15px] leading-[1.4] font-bold">{bijElkaar(line, 0)}</p> : null}
      {known ? (
        <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-pil bg-oranje-diep">
          <div className="h-full rounded-pil bg-studio" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </section>
  );
}

function Straks({ items, now }: { items: ProgramItem[]; now: number }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 px-0.5 py-1">
      <h2 id={titleId} className="m-0 text-[15px] font-bold text-zand">
        Straks
      </h2>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((item) => {
          const start = Date.parse(item.startsAt);
          const day = relativeDay(start, now);
          const details = itemDetails(item);
          return (
            <li key={item.id} className="flex items-baseline gap-3.5">
              <span className="flex w-[72px] flex-none flex-col">
                <span className="font-display text-[22px] leading-[1.1] text-mosterd">{formatTime(new Date(start))}</span>
                {day !== "vandaag" ? <span className="text-klein text-zand">{day}</span> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[17px] leading-tight font-bold">{bijElkaar(item.title, 0)}</span>
                {details ? <span className="text-label leading-[1.35] text-zand">{bijElkaar(details, 0)}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TeamKaart({ team }: { team: OwnTeam }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex items-center gap-3.5 rounded-[18px] bg-studio-licht px-3.5 py-3">
      <span aria-hidden="true" className={`h-10 w-10 flex-none rounded-[12px] ${TEAM_KLEUREN[team.color].vlak}`} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={titleId} className="m-0 text-[17px] leading-tight font-bold">
          {bijElkaar(teamLine(team), 0)}
        </h2>
        <p className="m-0 text-label leading-[1.35] text-zand">{jokerLine(team)}</p>
        <Link
          href="/teams"
          className="inline-flex min-h-11 items-center self-start text-label font-bold text-mosterd underline underline-offset-4"
        >
          Bekijk alle teams
        </Link>
      </div>
    </section>
  );
}
