"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";
import { Gespeeld, SlotMelding } from "@/components/score/Gespeeld";
import { Klassement } from "@/components/score/Klassement";
import { Medaillespiegel } from "@/components/score/Medaillespiegel";
import { IconScore } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { useLive } from "@/lib/client/live";
import type { ScoreView, ViewPart } from "@/lib/server/scoreboard";
import { bijElkaar } from "@/lib/shared/tekst";

/** "Stand na de quiz, vrijdag en 2 zeskampspellen". */
function standNa(parts: readonly ViewPart[]): string {
  const played = parts.filter((part) => part.played);
  const names: string[] = [];
  if (played.some((part) => part.kind === "quiz")) names.push("de quiz");
  if (played.some((part) => part.kind === "vrijdag")) names.push("vrijdag");
  const games = played.filter((part) => part.kind === "zeskamp").length;
  if (games > 0) names.push(games === 1 ? "1 zeskampspel" : `${games} zeskampspellen`);
  if (names.length === 0) return "Eén klassement over het hele weekend";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
  return bijElkaar(`Stand na ${list}`);
}

type Tab = "stand" | "medailles";

/** The scoreboard for everyone (SPEC §4.5), kept fresh by the doorbell. */
export function ScoreBord({ initial, beheerder }: { initial: ScoreView; beheerder: boolean }) {
  const { data } = useLive<ScoreView>("/api/score", initial);
  const view = data ?? initial;
  const [tab, setTab] = useState<Tab>("stand");
  const id = useId();

  const sub =
    view.show === "momentopname"
      ? "Op slot sinds de start van de zeskamp"
      : view.show === "verrast"
        ? "Je wilt zelf ook verrast worden"
        : standNa(view.parts);

  const kies = (next: Tab) => {
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };
  const toetsen = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      kies(tab === "stand" ? "medailles" : "stand");
    }
  };

  const tabKnop = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${value}`}
      aria-selected={tab === value}
      aria-controls={`${id}-${value}-paneel`}
      tabIndex={tab === value ? 0 : -1}
      onClick={() => setTab(value)}
      onKeyDown={toetsen}
      className={`min-h-11 rounded-[14px] text-[16px] font-extrabold ${tab === value ? "bg-beeldbuis text-studio" : "text-beeldbuis"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <SchermTitel sub={sub}>Scorebord</SchermTitel>

      {view.empty && view.show !== "verrast" ? (
        <div className="mt-4 flex flex-col gap-4">
          {view.locked && view.show === "momentopname" ? <SlotMelding takenAt={view.takenAt} /> : null}
          <LegeStaat icon={<IconScore size={34} />} titel="Nog geen punten">
            <p className="m-0">
              {bijElkaar("Het scorebord vult zich vanaf de quiz. Elk onderdeel telt mee: de quiz, de spelletjesmiddag en de zeskamp.")}
            </p>
            <p className="m-0">{bijElkaar("Per onderdeel zijn er medailles, zoals bij de Olympische Spelen.")}</p>
          </LegeStaat>
          {view.show === "momentopname" ? <Gespeeld parts={view.parts} jokers={view.jokers} titel="Gespeeld, punten volgen bij de onthulling" /> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {view.show === "momentopname" ? <SlotMelding takenAt={view.takenAt} /> : null}
          {beheerder && view.locked && view.show === "live" ? <SlotMelding takenAt={null} beheerder /> : null}
          {view.show === "verrast" ? (
            <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4]">
              De punten zijn vervaagd, want je wilt zelf ook verrast worden. Zet dit uit in{" "}
              <Link href="/beheer/scorebord" className="font-bold">
                {bijElkaar("Scorebord en punten.")}
              </Link>
            </p>
          ) : null}

          <div role="tablist" aria-label="Weergave" className="grid grid-cols-2 gap-1.5 rounded-[18px] bg-studio-diep p-[5px]">
            {tabKnop("stand", "Klassement")}
            {tabKnop("medailles", "Medaillespiegel")}
          </div>

          <div role="tabpanel" id={`${id}-stand-paneel`} aria-labelledby={`${id}-stand`} hidden={tab !== "stand"}>
            <Klassement rijen={view.standings} />
          </div>
          <div role="tabpanel" id={`${id}-medailles-paneel`} aria-labelledby={`${id}-medailles`} hidden={tab !== "medailles"}>
            <Medaillespiegel rijen={view.medals} />
          </div>

          {view.show === "momentopname" ? (
            <div className="mt-2">
              <Gespeeld parts={view.parts} jokers={view.jokers} titel="Gespeeld, punten volgen bij de onthulling" />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
