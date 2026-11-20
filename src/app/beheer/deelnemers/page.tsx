import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { Schakelaar } from "@/components/ui/Invoer";
import { Kaart } from "@/components/ui/Kaart";
import { listStaff } from "@/lib/server/access";
import { getRequestContext } from "@/lib/server/context";
import { listParticipants } from "@/lib/server/participants";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { listTeams } from "@/lib/server/teams";
import { formatTime, formatDayMonth } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { zetTeamsZichtbaar } from "./actions";
import { DeelnemerRij, PlakLijst, SpelleiderRij, SpelleiderToevoegen, TeamFormulier } from "./onderdelen";

export const metadata: Metadata = { title: "Deelnemers en teams" };

export default function DeelnemersPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

function sinds(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `${formatDayMonth(date)} om ${formatTime(date)}`;
}

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const [teams, deelnemers, spelleiders, settings] = await Promise.all([
    listTeams(ctx.env),
    listParticipants(ctx.env),
    listStaff("spelleider"),
    readSettings(),
  ]);
  const zonderTeam = deelnemers.filter((d) => !d.teamId || !teams.some((t) => t.id === d.teamId));
  const gekozen = deelnemers.filter((d) => d.claimed).length;

  return (
    <>
      <BeheerKop
        titel="Deelnemers en teams"
        sub={`${deelnemers.length} deelnemers, ${gekozen} hebben hun naam gekozen.`}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <nav aria-label="Op deze pagina" className="mt-4 flex flex-wrap gap-2">
        {[
          ["#teams", "Teams"],
          ["#deelnemers", "Deelnemers"],
          ["#spelleiders", "Spelleiders"],
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

      <section id="teams" aria-labelledby="teams-titel" className="mt-6 flex scroll-mt-4 flex-col gap-3">
        <h2 id="teams-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Teams
        </h2>
        <Kaart className="flex flex-col gap-2">
          <form action={zetTeamsZichtbaar}>
            <Schakelaar
              aan={settings.teamsVisible}
              label="Teams zichtbaar voor iedereen"
              hint="Zet dit aan als iedereen mag zien in welk team hij zit."
            />
          </form>
        </Kaart>
        {teams.map((team) => (
          <TeamFormulier
            key={team.id}
            team={{
              id: team.id,
              name: team.name,
              color: team.color,
              sort: team.sort,
              hasPin: team.hasPin,
              captainSinds: sinds(team.activeSince),
              leden: deelnemers.filter((d) => d.teamId === team.id).length,
            }}
          />
        ))}
      </section>

      <section id="deelnemers" aria-labelledby="deelnemers-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="deelnemers-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Deelnemers
        </h2>
        <PlakLijst teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
        <Link
          href="/beheer/deelnemers/nieuw"
          className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4"
        >
          Of voeg één deelnemer toe met alle gegevens
        </Link>
        {deelnemers.length === 0 ? (
          <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
            Nog niemand in de lijst. Plak de namen hierboven; daarna kiest iedereen zijn eigen naam in de app.
          </p>
        ) : null}
        {[...teams.map((t) => ({ key: t.id, titel: t.name, kleur: t.color })), { key: "geen", titel: "Nog geen team", kleur: null }].map(
          (groep) => {
            const leden = groep.key === "geen" ? zonderTeam : deelnemers.filter((d) => d.teamId === groep.key);
            if (leden.length === 0) return null;
            return (
              <div key={groep.key} className="flex flex-col gap-2">
                <h3 className="m-0 mt-2 flex items-center gap-2 text-[17px] font-extrabold">
                  {groep.kleur ? <TeamVlak kleur={groep.kleur} /> : null}
                  {groep.titel}
                  <span className="text-label font-medium text-zand">({leden.length})</span>
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {leden.map((d) => (
                    <DeelnemerRij
                      key={d.id}
                      deelnemer={{
                        id: d.id,
                        name: d.name,
                        nickname: d.nickname,
                        isChild: d.isChild,
                        isCaptain: d.isCaptain,
                        claimed: d.claimed,
                        funfactsKlaar: d.funfactsDoneAt !== null,
                      }}
                    />
                  ))}
                </ul>
              </div>
            );
          },
        )}
      </section>

      <section id="spelleiders" aria-labelledby="spelleiders-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="spelleiders-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Spelleiders
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          Spelleiders leiden de zeskamp en de spelletjesmiddag, en zien de afvinklijst. Ze loggen in via Inloggen voor de
          spelleiding, met hun eigen PIN.
        </p>
        <SpelleiderToevoegen />
        {spelleiders.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {spelleiders.map((s) => (
              <SpelleiderRij key={s.id} id={s.id} name={s.name} active={s.active} />
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
