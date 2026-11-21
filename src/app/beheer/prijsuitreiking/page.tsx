import type { Metadata } from "next";
import { Suspense } from "react";
import { Klassement } from "@/components/score/Klassement";
import { IconGeluid } from "@/components/ui/icons-zeskamp";
import { Kaart } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import { adminWantsSurprise, getScoreboard, liveView } from "@/lib/server/scoreboard";
import { requireAdmin } from "@/lib/server/session";
import { bijElkaar } from "@/lib/shared/tekst";
import { ceremonyPlan, nextStepLabel } from "@/lib/shared/ceremony";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { CeremonieKnop } from "./onderdelen";

export const metadata: Metadata = { title: "Prijsuitreiking" };

export default function PrijsuitreikingBeheerPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

const STAP_TEKST = {
  intro: "het beginscherm: wie wint De Valkenburger Spelen?",
  plaats: "een plaats is onthuld",
  trom: "het tromgeroffel",
  winnaar: "de winnaar met het podium",
  einde: "de eindstand met de medaillespiegel",
} as const;

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const live = await readLiveState(ctx.env);
  const [board, surprise] = await Promise.all([getScoreboard(ctx.env, live), adminWantsSurprise()]);
  const plan = ceremonyPlan(board.standings.map((row) => ({ team: row.team.id, place: row.place })));
  const actief = live.mode === "ceremonie";
  const stap = Math.min(live.ceremonyStep, plan.length - 1);
  const bezet = live.mode === "quiz" || live.mode === "intermezzo";

  return (
    <>
      <BeheerKop
        titel="Prijsuitreiking"
        sub={bijElkaar("Jij start de ceremonie en tikt door. Alle telefoons kijken tegelijk mee.")}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <div className="mt-5 flex flex-col gap-4">
        {actief ? (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[20px] font-extrabold">De prijsuitreiking loopt</h2>
            <p className="m-0 text-[15px] leading-[1.45]">
              {bijElkaar(`Stap ${stap + 1} van ${plan.length}: ${STAP_TEKST[plan[stap]?.kind ?? "intro"]}.`)}
            </p>
            <KnopLink href="/ceremonie" size="groot">
              Naar het ceremoniescherm
            </KnopLink>
            <div className="flex flex-col gap-2.5 border-t-2 border-papier-streep pt-3">
              <CeremonieKnop actie="volgende" stap={live.ceremonyStep} variant="secundair-licht">
                {nextStepLabel(plan, stap)}
              </CeremonieKnop>
              {stap > 0 ? (
                <CeremonieKnop actie="terug" stap={live.ceremonyStep} variant="secundair-licht">
                  Een stap terug
                </CeremonieKnop>
              ) : null}
              <CeremonieKnop actie="stop" stap={live.ceremonyStep} variant="tekst">
                Stop de prijsuitreiking
              </CeremonieKnop>
            </div>
          </Kaart>
        ) : (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[20px] font-extrabold">Klaar voor de ceremonie?</h2>
            <p className="m-0 text-[15px] leading-[1.45]">
              {bijElkaar(
                "Alle telefoons gaan tegelijk naar het ceremoniescherm. Daar tik jij door: plaats 4, 3 en 2, dan het tromgeroffel en de winnaar. Bij de onthulling van de winnaar gaat het slot open.",
              )}
            </p>
            {bezet ? (
              <p className="m-0 text-[15px] font-bold">{bijElkaar("De quiz of het intermezzo loopt nog. Sluit dat eerst af.")}</p>
            ) : null}
            <CeremonieKnop actie="start" disabled={bezet}>
              Start de prijsuitreiking
            </CeremonieKnop>
          </Kaart>
        )}

        <section className="flex items-start gap-3 rounded-[18px] bg-studio-licht px-4 py-3.5">
          <IconGeluid size={24} className="mt-0.5 flex-none text-mosterd" />
          <p className="m-0 text-[15px] leading-[1.45]">
            {bijElkaar(
              "Op jouw telefoon staat het geluid aan: tromgeroffel en fanfare. Hang hem aan de bluetoothspeaker. Op andere telefoons kiest iedereen zelf.",
            )}
          </p>
        </section>

        {!surprise && !board.empty ? (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-pil border-2 border-zand px-4 text-[16px] font-bold [&::-webkit-details-marker]:hidden">
              Spiekbriefje: de echte eindstand
            </summary>
            <div className="mt-3">
              <Klassement rijen={liveView(board, live, true).standings} label="Echte eindstand" />
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
