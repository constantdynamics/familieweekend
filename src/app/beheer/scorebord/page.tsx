import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Klassement } from "@/components/score/Klassement";
import { Medaillespiegel } from "@/components/score/Medaillespiegel";
import { Punten, TeamBalk } from "@/components/score/Punten";
import { Schakelaar } from "@/components/ui/Invoer";
import { Kaart } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import {
  adminWantsSurprise,
  getScoreboard,
  latestSnapshot,
  liveView,
  surpriseView,
} from "@/lib/server/scoreboard";
import { requireAdmin } from "@/lib/server/session";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayAndTime, formatTime } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { draaiPuntenTerug, zetSlotAutomatisch, zetVerrast } from "./actions";
import { PuntenFormulier, SlotKnop } from "./onderdelen";

export const metadata: Metadata = { title: "Scorebord en punten" };

export default function ScorebordBeheerPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const live = await readLiveState(ctx.env);
  const [board, surprise, snapshot] = await Promise.all([
    getScoreboard(ctx.env, live),
    adminWantsSurprise(),
    live.lockClosed ? latestSnapshot(ctx.env) : Promise.resolve(null),
  ]);
  const view = surprise ? surpriseView(board, live) : liveView(board, live, true);
  const teams = new Map(board.teams.map((team) => [team.id, team]));

  return (
    <>
      <BeheerKop
        titel="Scorebord en punten"
        sub={bijElkaar("Het slot, de echte stand en losse punten. Uitslagen verbeter je bij Zeskamp.")}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <nav aria-label="Op deze pagina" className="mt-4 flex flex-wrap gap-2">
        {[
          ["#slot", "Slot"],
          ["#stand", "Stand"],
          ["#punten", "Losse punten"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-pil bg-studio-licht px-4 text-[15px] font-bold text-beeldbuis no-underline hover:text-beeldbuis"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="slot" aria-labelledby="slot-titel" className="mt-6 flex scroll-mt-4 flex-col gap-3">
        <h2 id="slot-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Slot
        </h2>
        <Kaart className="flex flex-col gap-3">
          <p className="m-0 text-[17px] leading-snug font-extrabold">
            {live.lockClosed ? "Het scorebord zit op slot." : "Het scorebord is open."}
          </p>
          <p className="m-0 text-[15px] leading-[1.45]">
            {live.lockClosed
              ? bijElkaar(
                  `${
                    (snapshot?.takenAt ?? live.lockClosedAt)
                      ? `Iedereen ziet de stand van ${formatDayAndTime(new Date((snapshot?.takenAt ?? live.lockClosedAt)!))}.`
                      : "Iedereen ziet de bewaarde stand."
                  } Het slot gaat open bij de onthulling van de winnaar in de prijsuitreiking.`,
                )
              : live.lockAuto
                ? bijElkaar("Iedereen ziet de echte stand. Bij de start van het eerste zeskampspel gaat het slot vanzelf dicht.")
                : bijElkaar("Iedereen ziet de echte stand.")}
          </p>
          <SlotKnop dicht={live.lockClosed} />
        </Kaart>
        <Kaart className="flex flex-col gap-4">
          <form action={zetSlotAutomatisch}>
            <Schakelaar
              aan={live.lockAuto}
              label={bijElkaar("Vanzelf dicht bij de start van het eerste zeskampspel")}
              hint={
                live.lockAuto
                  ? bijElkaar("Aan. Het slot gaat dicht zodra een spelleider een spel start, en de stand van dat moment wordt bewaard.")
                  : bijElkaar("Uit. Het slot gaat niet vanzelf dicht. Zet dit weer aan als dat wel moet.")
              }
            />
          </form>
          <form action={zetVerrast} className="border-t-2 border-papier-streep pt-4">
            <Schakelaar
              aan={surprise}
              label={bijElkaar("Ik wil zelf ook verrast worden")}
              hint={bijElkaar("Op deze telefoon zijn de punten en plaatsen dan vervaagd, ook in beheer.")}
            />
          </form>
        </Kaart>
      </section>

      <section id="stand" aria-labelledby="stand-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="stand-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          {live.lockClosed ? "De echte stand" : "De stand"}
        </h2>
        {view.empty ? (
          <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
            {bijElkaar("Nog geen punten. Die komen er vanzelf bij: uit de quiz, het intermezzo, vrijdag en de zeskamp.")}
          </p>
        ) : (
          <>
            <Klassement rijen={view.standings} />
            <h3 className="m-0 mt-3 text-[19px] font-extrabold">Medaillespiegel</h3>
            <Medaillespiegel rijen={view.medals} />
          </>
        )}
        <p className="m-0 text-[15px] leading-[1.45]">
          Een uitslag verbeteren of de punten van vrijdag invullen?{" "}
          <Link href="/beheer/zeskamp" className="font-bold">
            {bijElkaar("Naar Zeskamp.")}
          </Link>
        </p>
      </section>

      <section id="punten" aria-labelledby="punten-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="punten-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Losse punten
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Voor een mooie actie, of als straf. De reden staat in de opbouw van het team.")}
        </p>
        <PuntenFormulier teams={board.teams.map((team) => ({ id: team.id, name: team.name }))} />
        {board.bonus.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[...board.bonus].reverse().map((bonus) => {
              const team = teams.get(bonus.teamId);
              return (
                <li key={bonus.id} className="flex items-center gap-3 rounded-[16px] bg-studio-licht px-4 py-3">
                  {team ? <TeamBalk kleur={team.color} className="h-9" /> : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] leading-tight font-bold">
                      {team?.name ?? "Onbekend team"}:{"\u00a0"}
                      <Punten twelfths={bonus.twelfths} plus />
                    </span>
                    <span className="text-label text-zand">
                      {bijElkaar(`${bonus.reason} (${bonus.givenBy}, ${formatTime(new Date(bonus.createdAt))})`)}
                    </span>
                  </span>
                  <form action={draaiPuntenTerug}>
                    <input type="hidden" name="id" value={bonus.id} />
                    <Knop type="submit" variant="secundair" size="klein">
                      Draai terug
                    </Knop>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </>
  );
}
