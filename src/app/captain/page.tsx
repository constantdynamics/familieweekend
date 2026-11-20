import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconJoker } from "@/components/ui/icons";
import { Kaart, Melding, SchermTitel } from "@/components/ui/Kaart";
import { Knop, KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { stopAlsCaptain } from "./actions";
import { CaptainLogin } from "./CaptainLogin";

export const metadata: Metadata = { title: "Captain" };

export default function CaptainPage({ searchParams }: PageProps<"/captain">) {
  return (
    <Scherm metTabBalk={false} boven={52}>
      <Suspense fallback={<div className="h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud searchParams={searchParams} />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/captain">["searchParams"] }) {
  const ctx = await getRequestContext();
  const params = await searchParams;
  const terug = typeof params.terug === "string" ? params.terug : "";
  const proef = ctx.env === "test" ? <Melding tone="info">Proefmodus: je logt in bij een testteam.</Melding> : null;

  if (ctx.captainTeam) {
    const team = ctx.captainTeam;
    return (
      <>
        <SchermTitel sub="Deze telefoon is het teamtoestel.">Captain</SchermTitel>
        <Kaart className="mt-6 flex flex-col gap-3">
          <p className="m-0 flex items-center gap-2.5 text-[22px] font-extrabold">
            <TeamVlak kleur={team.color} className="h-7 w-7" />
            {team.name}
          </p>
          <p className="m-0 text-[15px] leading-[1.45]">
            Tijdens de quiz kies jij de antwoorden, en jij zet de joker in. De rest van je team kijkt mee op zijn eigen
            telefoon. Overleg gerust!
          </p>
          <p className="m-0 flex items-center gap-2 text-[15px] font-bold">
            <IconJoker size={20} />
            Eén joker in de quiz, één bij de zeskamp.
          </p>
          <KnopLink href={terug || "/"} size="groot">
            {terug ? "Verder" : "Naar Thuis"}
          </KnopLink>
        </Kaart>
        <form action={stopAlsCaptain} className="mt-5">
          <Knop type="submit" variant="secundair" size="klein">
            Stop als captain op deze telefoon
          </Knop>
        </form>
        {proef}
      </>
    );
  }

  return (
    <>
      <SchermTitel sub="Elk team heeft één teamtoestel. Log je hier in, dan wordt deze telefoon het teamtoestel.">
        Captain
      </SchermTitel>
      {ctx.captainTakenOver ? (
        <div className="mt-5">
          <Melding tone="info">Je teamtoestel is overgenomen door een ander toestel.</Melding>
        </div>
      ) : null}
      {proef ? <div className="mt-4">{proef}</div> : null}
      <CaptainLogin terug={terug} />
    </>
  );
}
