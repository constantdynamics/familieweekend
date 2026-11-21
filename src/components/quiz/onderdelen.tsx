"use client";

import type { ReactNode } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconJoker } from "@/components/ui/icons";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import type { TeamColor } from "@/lib/server/quiz/types";

/** Small building blocks shared by the quiz screens and the console. */

export function korteNaam(name: string): string {
  return name.replace(/^(proef)?team\s+/i, "").trim() || name;
}

/** A photo of a question: a cream print, slightly askew, with who took or sent it. */
export function QuizFoto({ src, onderschrift, alt }: { src: string; onderschrift: string | null; alt: string }) {
  return (
    <figure className="m-0 flex -rotate-[1.2deg] flex-col gap-2.5 rounded-[10px] bg-beeldbuis p-3 pb-3.5 text-studio shadow-kaart">
      {/* A signed link that expires in minutes: next/image would keep a copy longer than allowed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="aspect-[10/7] w-full rounded-[4px] bg-papier-streep object-contain" />
      {onderschrift ? <figcaption className="text-[14px] leading-[1.35] font-semibold">{bijElkaar(onderschrift)}</figcaption> : null}
    </figure>
  );
}

/** "Luister goed" with a moving equalizer (listening mode for meekijkers). */
export function LuisterGoed() {
  const balken = ["bg-mosterd", "bg-oranje", "bg-avocado-licht", "bg-petrol-licht", "bg-mosterd"];
  return (
    <section
      aria-labelledby="luister-titel"
      className="flex flex-col items-center gap-5 rounded-kaart-groot bg-studio-licht px-6 py-10 text-center"
    >
      <div className="quiz-equalizer flex h-24 items-end gap-2.5" aria-hidden="true">
        {balken.map((kleur, index) => (
          <span key={index} className={`block h-full w-4 rounded-pil ${kleur}`} />
        ))}
      </div>
      <h2 id="luister-titel" className="m-0 font-display text-[42px] leading-none font-normal schaduw-oranje">
        Luister goed
      </h2>
      <p className="m-0 max-w-[280px] text-[16px] leading-[1.45] text-zand">
        De quizmaster speelt een fragment. Jullie captain ziet de antwoorden, dus fluister maar.
      </p>
    </section>
  );
}

/** The mustard strip: this round counts double for the team. */
export function JokerStrook({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2.5 rounded-pil bg-mosterd px-4 py-2 text-[15px] leading-[1.3] font-bold text-studio">
      <IconJoker size={22} />
      <span>{children}</span>
    </p>
  );
}

export type StandRij = {
  teamId: string;
  name: string;
  color: TeamColor;
  place: number;
  shared: boolean;
  twelfths: number;
  jokerRound: number | null;
};

const PLAATS_KLEUR: Record<number, string> = { 1: "bg-goud", 2: "bg-zilver", 3: "bg-brons" };

/** The interim standing (and the end of the quiz): place, team block, name, points. */
export function StandLijst({ rijen, eigenTeam, label }: { rijen: StandRij[]; eigenTeam?: string | null; label: string }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label={label}>
      {rijen.map((rij) => (
        <li
          key={rij.teamId}
          className={`flex items-center gap-3 rounded-kaart px-4 py-3 ${
            rij.teamId === eigenTeam ? "bg-beeldbuis text-studio shadow-kaart" : "bg-studio-licht text-beeldbuis"
          }`}
        >
          <span
            className={`flex h-10 w-10 flex-none items-center justify-center rounded-pil text-[18px] font-extrabold text-studio cijfers ${
              PLAATS_KLEUR[rij.place] ?? "bg-zand"
            }`}
          >
            {rij.place}
          </span>
          <TeamVlak kleur={rij.color} className="h-6 w-6" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(rij.name)}</span>
            {rij.shared || rij.jokerRound ? (
              <span className="text-label leading-[1.3]">
                {[rij.shared ? "gedeeld" : null, rij.jokerRound ? `joker in ronde ${rij.jokerRound}` : null].filter(Boolean).join(", ")}
              </span>
            ) : null}
          </span>
          <span className="font-display text-[30px] leading-none cijfers">
            {formatPoints(rij.twelfths)}
            <span className="sr-only"> punten</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
