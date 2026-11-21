"use client";

import { useEffect, useRef, useState } from "react";
import { Embleem } from "@/components/brand/Embleem";
import { Confetti } from "@/components/score/Confetti";
import { Klassement } from "@/components/score/Klassement";
import { Medaillespiegel } from "@/components/score/Medaillespiegel";
import { Podium } from "@/components/score/Podium";
import { Punten, TeamBalk } from "@/components/score/Punten";
import { IconGeluid, IconGeluidUit, IconTrom } from "@/components/ui/icons-zeskamp";
import { Melding } from "@/components/ui/Kaart";
import { Knop, KnopLink } from "@/components/ui/Knop";
import { fanfare, tromgeroffel, useGeluid, wekGeluid } from "@/lib/client/geluid";
import { pokeLive, useLive } from "@/lib/client/live";
import type { CeremonyView, RevealGroup, RevealTeam } from "@/lib/server/ceremony";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";

/**
 * The prize ceremony on every phone (SPEC §4.5): the admin taps through,
 * everyone follows live. Place 4, 3 and 2, a drumroll, the winner with the
 * rising podium and confetti, and then the final standings and the medal
 * table. Sound only where it is switched on.
 */

function namen(teams: readonly RevealTeam[]): string {
  const list = teams.map((entry) => entry.team.name);
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} en ${list.at(-1)}`;
}

function winnaarZin(groep: RevealGroup): string {
  return groep.teams.length > 1
    ? `${namen(groep.teams)} winnen samen De Valkenburger Spelen 2027!`
    : `${namen(groep.teams)} wint De Valkenburger Spelen 2027!`;
}

function plaatsZin(groep: RevealGroup): string {
  const punten = formatPoints(groep.teams[0]?.twelfths ?? 0);
  return groep.shared
    ? `Plaats ${groep.place}, gedeeld: ${namen(groep.teams)}, met ${punten} punten.`
    : `Plaats ${groep.place}: ${namen(groep.teams)}, met ${punten} punten.`;
}

/** What a screen reader hears at each step. */
function aankondiging(view: CeremonyView): string {
  switch (view.current) {
    case "plaats": {
      const nieuw = view.revealed.at(-1);
      return nieuw ? plaatsZin(nieuw) : "";
    }
    case "trom":
      return "Tromgeroffel! Nog één plaats te gaan.";
    case "winnaar":
      return view.winners ? winnaarZin(view.winners) : "";
    case "einde":
      return view.final?.medalLeaders.length
        ? `De eindstand. De medaillespiegel gaat naar ${view.final.medalLeaders.map((team) => team.name).join(" en ")}.`
        : "De eindstand.";
    default:
      return "";
  }
}

const TROM_CSS = `
@keyframes valk-trom { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.valk-trom { animation: valk-trom 120ms linear infinite; }
@media (prefers-reduced-motion: reduce) { .valk-trom { animation: none; } }
`;

export function Ceremonie({ initial, beheerder }: { initial: CeremonyView; beheerder: boolean }) {
  const live = useLive<CeremonyView>("/api/ceremonie", initial);
  const view = live.data ?? initial;
  const [geluid, zetGeluid] = useGeluid(beheerder);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const vorige = useRef<string | null>(null);
  const trom = useRef<(() => void) | null>(null);

  const { active, step, current } = view;

  // The drumroll and the fanfare follow the steps, on phones with sound on.
  useEffect(() => {
    const key = `${active}-${step}-${current}`;
    const eerder = vorige.current;
    vorige.current = key;
    if ((current !== "trom" || !geluid || !active) && trom.current) {
      trom.current();
      trom.current = null;
    }
    if (!geluid || !active || eerder === null || eerder === key) return;
    if (current === "trom" && !trom.current) trom.current = tromgeroffel();
    if (current === "winnaar") fanfare();
  }, [active, step, current, geluid]);

  useEffect(
    () => () => {
      trom.current?.();
      trom.current = null;
    },
    [],
  );

  // Browsers only play sound after a tap: any tap on the page wakes it up.
  useEffect(() => {
    if (!geluid) return;
    const wek = () => void wekGeluid();
    window.addEventListener("pointerdown", wek);
    return () => window.removeEventListener("pointerdown", wek);
  }, [geluid]);

  const stuur = async (actie: "volgende" | "terug" | "stop") => {
    if (geluid) void wekGeluid();
    setBezig(true);
    setFout(null);
    try {
      const response = await fetch("/api/ceremonie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ actie, stap: view.step }),
      });
      if (!response.ok && response.status !== 409) {
        const data = (await response.json().catch(() => ({}))) as { fout?: string };
        setFout(data.fout ?? "Dat lukte niet. Tik nog een keer.");
      }
    } catch {
      setFout("Geen verbinding. Tik nog een keer zodra je weer online bent.");
    } finally {
      setBezig(false);
      pokeLive();
      live.refresh();
    }
  };

  const showFinal = view.final !== null && (view.current === "einde" || view.finished);

  return (
    <>
      <style href="valk-trom" precedence="default">
        {TROM_CSS}
      </style>
      <header className="flex items-center gap-3 pr-10">
        <Embleem size={72} className="flex-none" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Prijsuitreiking</h1>
          <p className="m-0 text-[15px] text-zand">De Valkenburger Spelen 2027</p>
        </div>
      </header>

      <div className="mt-3 flex">
        <button
          type="button"
          aria-pressed={geluid}
          onClick={() => zetGeluid(!geluid)}
          className="inline-flex min-h-11 items-center gap-2 rounded-pil border-2 border-zand px-4 text-[15px] font-bold text-beeldbuis"
        >
          {geluid ? <IconGeluid size={20} /> : <IconGeluidUit size={20} />}
          {geluid ? "Geluid aan" : "Geluid uit"}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {aankondiging(view)}
      </p>

      <div className="mt-4 flex flex-col gap-3.5">
        {!view.active && !view.finished ? (
          <section className="op-licht flex flex-col gap-3 rounded-kaart-groot bg-beeldbuis p-[22px] text-studio shadow-kaart">
            <h2 className="m-0 font-display text-[clamp(23px,6.6vw,28px)] leading-[1.12] font-normal">
              {bijElkaar("De prijsuitreiking komt eraan")}
            </h2>
            <p className="m-0 text-[16px] leading-[1.45]">
              {bijElkaar("Op zaterdagavond, na het feestdiner, gaan de plaatsen er één voor één af. Op alle telefoons tegelijk.")}
            </p>
            {view.lockClosed ? <p className="m-0 text-[14px] leading-[1.4]">{bijElkaar("Tot die tijd zit het scorebord op slot.")}</p> : null}
            <KnopLink href="/" variant="secundair-licht" className="self-start">
              Naar Thuis
            </KnopLink>
          </section>
        ) : null}

        {view.active && view.current === "intro" ? (
          <section className="op-licht flex flex-col gap-3 rounded-kaart-groot bg-beeldbuis p-[22px] text-studio shadow-kaart">
            <h2 className="m-0 font-display text-[clamp(23px,6.6vw,28px)] leading-[1.12] font-normal">
              {bijElkaar("Wie wint De Valkenburger Spelen?")}
            </h2>
            <p className="m-0 text-[16px] leading-[1.45]">
              {bijElkaar(
                `${view.lockClosed ? "Het scorebord zit sinds de start van de zeskamp op slot. " : ""}Nu gaan de plaatsen er één voor één af, op alle telefoons tegelijk.`,
              )}
            </p>
            <p className="m-0 text-[14px] leading-[1.4]">
              {bijElkaar(beheerder ? "Jij tikt door. Zet je telefoon aan de speaker." : "De beheerder tikt door. Kijk mee!")}
            </p>
          </section>
        ) : null}

        {view.revealed.length > 0 && !showFinal && view.current !== "winnaar" ? (
          <Onthuld groepen={view.revealed} nieuwste={view.current === "plaats" ? view.step : -1} />
        ) : null}

        {view.current === "trom" && view.active ? (
          <div className="flex items-center gap-2.5 rounded-[18px] bg-studio-licht px-4 py-3 text-[16px] font-bold">
            <IconTrom size={28} className="valk-trom flex-none text-mosterd" />
            <span className="min-w-0">
              {bijElkaar(view.hidden > 1 ? `Nog ${view.hidden} plaatsen te gaan. Tromgeroffel!` : "Nog één plaats te gaan. Tromgeroffel!")}
            </span>
          </div>
        ) : null}

        {view.current === "winnaar" && view.winners && view.podium ? (
          <section className="flex flex-col gap-3.5">
            <h2 className="m-0 font-display text-[27px] leading-[1.15] font-normal schaduw-roest motion-safe:animate-pop">
              {bijElkaar(winnaarZin(view.winners))}
            </h2>
            <Podium blokken={view.podium} />
            {view.revealed.filter((groep) => groep.place > 3).length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-[18px] bg-studio-licht px-3.5 py-3 text-[15px] leading-[1.4]">
                {view.revealed
                  .filter((groep) => groep.place > 3)
                  .sort((a, b) => a.place - b.place)
                  .map((groep) => (
                    <p key={groep.place} className="m-0">
                      {bijElkaar(plaatsZin(groep))}
                    </p>
                  ))}
              </div>
            ) : null}
            <Confetti />
          </section>
        ) : null}

        {showFinal && view.final ? (
          <section className="flex flex-col gap-3.5">
            {view.finished ? <Melding tone="info">{bijElkaar("De prijsuitreiking is afgelopen. Tot de volgende Spelen!")}</Melding> : null}
            <h2 className="m-0 font-display text-[27px] leading-[1.15] font-normal schaduw-oranje">De eindstand</h2>
            <Klassement rijen={view.final.standings} label="Eindstand" />
            {view.final.medalLeaders.length > 0 ? (
              <h2 className="m-0 mt-2 font-display text-[24px] leading-[1.2] font-normal schaduw-oranje">
                {bijElkaar(
                  `De medaillespiegel gaat naar ${view.final.medalLeaders.map((team) => team.name).join(" en ")}!`,
                )}
              </h2>
            ) : (
              <h2 className="m-0 mt-2 font-display text-[24px] leading-[1.2] font-normal schaduw-oranje">De medaillespiegel</h2>
            )}
            <Medaillespiegel rijen={view.final.medals} />
            {view.finished ? null : <Confetti zaad={11} aantal={30} />}
            <p className="m-0 font-display text-[24px] leading-[1.2] schaduw-oranje">{bijElkaar("Tot de volgende Spelen!")}</p>
            {view.finished ? (
              <KnopLink href="/" variant="secundair" className="self-start">
                Naar Thuis
              </KnopLink>
            ) : null}
          </section>
        ) : null}

        {fout ? <Melding tone="fout">{fout}</Melding> : null}

        {view.admin ? (
          <div className="mt-1 flex flex-col gap-2.5">
            <Knop size="groot" disabled={bezig} onClick={() => void stuur("volgende")}>
              {view.admin.next}
            </Knop>
            <div className="flex flex-wrap items-center gap-2.5">
              {view.admin.canBack ? (
                <Knop variant="secundair" size="klein" disabled={bezig} onClick={() => void stuur("terug")}>
                  Een stap terug
                </Knop>
              ) : null}
              <Knop variant="tekst" size="klein" disabled={bezig} onClick={() => void stuur("stop")}>
                Stop de prijsuitreiking
              </Knop>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Onthuld({ groepen, nieuwste }: { groepen: RevealGroup[]; nieuwste: number }) {
  const lijst = [...groepen].sort((a, b) => a.place - b.place);
  const laatste = groepen.at(-1)?.place;
  return (
    <ol aria-label="Onthulde plaatsen" className="m-0 flex list-none flex-col gap-2.5 p-0">
      {lijst.flatMap((groep) =>
        groep.teams.map((rij) => (
          <li
            key={rij.team.id}
            className={`op-licht flex items-center gap-3 rounded-[20px] bg-beeldbuis px-3.5 py-3 text-studio shadow-[0_5px_0_#140B06] ${
              nieuwste >= 0 && groep.place === laatste ? "motion-safe:animate-pop" : ""
            }`}
          >
            <span className="flex w-[38px] flex-none flex-col items-center">
              <span className="sr-only">Plaats </span>
              <span className="font-display text-[28px] leading-none">{groep.place}</span>
              {groep.shared ? <span className="text-klein font-bold">gedeeld</span> : null}
            </span>
            <TeamBalk kleur={rij.team.color} className="h-10" />
            <span className="min-w-0 flex-1 text-[18px] leading-tight font-extrabold">{bijElkaar(rij.team.name)}</span>
            <Punten twelfths={rij.twelfths} className="font-display text-[26px] leading-none" />
          </li>
        )),
      )}
    </ol>
  );
}
