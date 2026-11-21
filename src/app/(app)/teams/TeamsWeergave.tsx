"use client";

import Link from "next/link";
import { useId } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconJoker, IconMensen } from "@/components/ui/icons";
import { Kaart } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { useLive } from "@/lib/client/live";
import { jokerStatus, type TeamsView, type TeamView } from "@/lib/shared/home";
import { bijElkaar } from "@/lib/shared/tekst";

/** The teams, kept live (a joker played shows up on every phone). */
export function TeamsWeergave({ initial, isAdmin }: { initial: TeamsView; isAdmin: boolean }) {
  const { data } = useLive<TeamsView>("/api/teams", initial);
  const view = data ?? initial;

  if (!view.toon) {
    return (
      <div className="mt-4">
        <LegeStaat icon={<IconMensen size={34} />} titel="De teams zijn nog geheim">
          <p className="m-0">
            {bijElkaar("Vlak voor het weekend maakt de spelleiding bekend wie bij wie zit. Spannend!", 0)}
          </p>
        </LegeStaat>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {isAdmin && !view.familieZiet ? (
        <p className="m-0 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4]">
          {bijElkaar("Alleen jij ziet de teams nu. Zet Teams zichtbaar aan als iedereen het mag weten.", 0)}{" "}
          <Link href="/beheer/deelnemers#teams" className="font-bold underline underline-offset-4">
            Naar beheer
          </Link>
        </p>
      ) : null}
      {view.teams.length === 0 ? (
        <p className="m-0 text-[15px] text-zand">Er zijn nog geen teams.</p>
      ) : (
        view.teams.map((team) => <TeamKaart key={team.id} team={team} />)
      )}
      {view.zonderTeam > 0 && isAdmin ? (
        <p className="m-0 text-label text-zand">
          {view.zonderTeam === 1 ? "1 naam zit nog niet in een team." : `${view.zonderTeam} namen zitten nog niet in een team.`}
        </p>
      ) : null}
    </div>
  );
}

function TeamKaart({ team }: { team: TeamView }) {
  const titleId = useId();
  return (
    <Kaart aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <TeamVlak kleur={team.color} className="h-7 w-7" />
        <h2 id={titleId} className="m-0 min-w-0 text-[20px] leading-tight font-extrabold">
          {bijElkaar(team.name, 0)}
          {team.jij ? <span className="sr-only">, jouw team</span> : null}
        </h2>
        {team.jij ? (
          <span aria-hidden="true" className="ml-auto flex-none rounded-pil bg-studio px-2.5 py-0.5 text-klein font-bold text-beeldbuis">
            Jouw team
          </span>
        ) : null}
      </div>

      <p className="m-0 text-[15px] leading-[1.4]">
        {team.captain ? (
          <>
            Captain: <strong>{team.captain}</strong>
          </>
        ) : (
          "Nog geen captain"
        )}
      </p>

      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Jokers">
        {(["quiz", "zeskamp"] as const).map((kind) => (
          <li key={kind} className="flex items-center gap-2 text-label leading-[1.35]">
            <IconJoker size={18} />
            <span>{bijElkaar(jokerStatus(kind, team.jokers[kind]), 0)}</span>
          </li>
        ))}
      </ul>

      {team.members.length === 0 ? (
        <p className="m-0 text-label">Nog niemand in dit team.</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={`Leden van ${team.name}`}>
          {team.members.map((member) => (
            <li
              key={member.id}
              className={`rounded-pil px-3 py-1 text-[15px] font-bold ${member.jij ? "bg-mosterd" : "bg-papier-streep"}`}
            >
              {member.name}
              {member.captain ? <span className="font-medium"> (captain)</span> : null}
              {member.jij ? <span className="sr-only">, dat ben jij</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  );
}
