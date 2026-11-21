import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconKaartjes, IconPijlTerug, IconPijlVerder, IconVinkje } from "@/components/ui/icons";
import { Chip, Melding, SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { requireStaff } from "@/lib/server/session";
import { latestEntries, listGames } from "@/lib/server/zeskamp";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import { RESULT_TYPE_LABELS, STATUS_LABELS, isResultType } from "@/lib/shared/zeskamp";
import { Wachtrij } from "./Wachtrij";

export const metadata: Metadata = { title: "Zeskamp leiden" };

export default function SpelleiderZeskampPage() {
  return (
    <Scherm metTabBalk={false} boven={34}>
      <Suspense fallback={<div className="h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

const STATUS_STIJL = {
  gepland: "bg-studio-licht text-beeldbuis",
  bezig: "bg-oranje text-studio",
  klaar: "bg-avocado-licht text-studio",
} as const;

async function Inhoud() {
  const staff = await requireStaff();
  const ctx = await getRequestContext();
  const [games, entries] = await Promise.all([listGames(ctx.env), latestEntries(ctx.env)]);

  return (
    <>
      <Link
        href="/spelleider"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
      >
        <IconPijlTerug size={20} />
        Spelleiding
      </Link>
      <SchermTitel chip={<Chip>{staff.role === "beheerder" ? "Beheerder" : "Spelleider"}</Chip>} sub="Kies het spel dat je gaat leiden.">
        Zeskamp
      </SchermTitel>
      {ctx.env === "test" ? (
        <div className="mt-4">
          <Melding tone="info">{bijElkaar("Je zit in de proef. Uitslagen tellen alleen voor de proefteams.")}</Melding>
        </div>
      ) : null}
      <Wachtrij />

      {games.length === 0 ? (
        <p className="m-0 mt-6 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px]">
          {bijElkaar("Er staan nog geen spellen klaar. De beheerder zet ze in Beheer, bij Zeskamp.")}
        </p>
      ) : (
        <ol className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
          {games.map((game) => {
            const entry = entries[game.id];
            const meta = entry
              ? `Uitslag van ${entry.by}, ${formatTime(new Date(entry.at))}`
              : game.status === "bezig" && game.startedBy
                ? `Gestart door ${game.startedBy}${game.startedAt ? `, ${formatTime(new Date(game.startedAt))}` : ""}`
                : isResultType(game.resultType)
                  ? RESULT_TYPE_LABELS[game.resultType]
                  : "Nog geen uitslagtype";
            return (
              <li key={game.id} className="flex">
                <Link
                  href={`/spelleider/zeskamp/${game.id}`}
                  className="op-licht flex min-h-[84px] min-w-0 flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
                >
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd font-display text-[22px]">
                    <span className="sr-only">Spel </span>
                    {game.number}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(game.name)}</span>
                    <span className="text-label leading-[1.35]">{bijElkaar(meta)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-pil px-2.5 py-0.5 text-[14px] font-bold ${STATUS_STIJL[game.status]}`}>
                      {game.status === "klaar" ? <IconVinkje size={15} strokeWidth={3} /> : null}
                      {STATUS_LABELS[game.status]}
                    </span>
                  </span>
                  <IconPijlVerder size={20} className="flex-none" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-6 flex items-start gap-3 rounded-[18px] bg-studio-licht px-4 py-3.5">
        <IconKaartjes size={24} className="mt-0.5 flex-none text-mosterd" />
        <p className="m-0 text-[15px] leading-[1.45]">
          Spelletjesmiddag of uitbeelden? Gebruik de{" "}
          <Link href="/spelleider/spelhulp" className="font-bold">
            spelhulp
          </Link>{" "}
          {bijElkaar("voor kaartjes, een timer en een teller. De punten van vrijdag zet de beheerder in het scorebord.")}
        </p>
      </section>
    </>
  );
}
