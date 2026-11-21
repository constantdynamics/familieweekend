import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconPijlVerder, IconPlus, IconVinkje } from "@/components/ui/icons";
import { Kaart } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { listTeams } from "@/lib/server/teams";
import { latestEntries, listGames, readVrijdagPoints } from "@/lib/server/zeskamp";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import { isResultType, MODE_LABELS, RESULT_TYPE_LABELS, STATUS_LABELS } from "@/lib/shared/zeskamp";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { PuntentabelFormulier, SpelFormulier, VrijdagFormulier } from "./onderdelen";

export const metadata: Metadata = { title: "Zeskamp en vrijdag" };

export default function ZeskampBeheerPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

const STATUS_STIJL = {
  gepland: "bg-studio text-beeldbuis",
  bezig: "bg-oranje text-studio",
  klaar: "bg-avocado-licht text-studio",
} as const;

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const [games, entries, teams, vrijdag, settings] = await Promise.all([
    listGames(ctx.env),
    latestEntries(ctx.env),
    listTeams(ctx.env),
    readVrijdagPoints(ctx.env),
    readSettings(),
  ]);
  const volgende = (games.at(-1)?.sort ?? 10) + 1;

  return (
    <>
      <BeheerKop
        titel="Zeskamp en vrijdag"
        sub={bijElkaar("De spellen, de punten van de spelletjesmiddag en de puntentabel.")}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <nav aria-label="Op deze pagina" className="mt-4 flex flex-wrap gap-2">
        {[
          ["#spellen", "Spellen"],
          ["#vrijdag", "Vrijdag"],
          ["#tabel", "Puntentabel"],
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

      <section id="spellen" aria-labelledby="spellen-titel" className="mt-6 flex scroll-mt-4 flex-col gap-3">
        <h2 id="spellen-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Spellen
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Tik op een spel om het te wijzigen, een uitslag te verbeteren of de joker te verzetten.")}
        </p>
        {games.length === 0 ? (
          <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px]">{bijElkaar("Nog geen spellen. Voeg ze hieronder toe.")}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {games.map((game) => {
              const entry = entries[game.id];
              const meta = [
                isResultType(game.resultType) ? RESULT_TYPE_LABELS[game.resultType] : "Nog geen uitslagtype",
                MODE_LABELS[game.mode].toLowerCase(),
                entry ? `uitslag van ${entry.by} om ${formatTime(new Date(entry.at))}` : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={game.id} className="flex">
                  <Link
                    href={`/beheer/zeskamp/${game.id}`}
                    className="op-licht flex min-h-[76px] min-w-0 flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
                  >
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-pil bg-mosterd font-display text-[20px]">
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
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-pil border-2 border-zand px-4 text-[16px] font-bold [&::-webkit-details-marker]:hidden">
            <IconPlus size={20} />
            Voeg een spel toe
          </summary>
          <Kaart className="mt-3 flex flex-col gap-3">
            <h3 className="m-0 text-[19px] font-extrabold">Nieuw spel</h3>
            <SpelFormulier
              spel={{ id: null, name: "", description: null, sort: volgende, resultType: null, unit: null, mode: "tegelijk", jokerAllowed: true }}
            />
          </Kaart>
        </details>
      </section>

      <section id="vrijdag" aria-labelledby="vrijdag-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="vrijdag-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Vrijdag: spelletjesmiddag
        </h2>
        <VrijdagFormulier
          teams={teams.map((team) => ({ id: team.id, name: team.name, color: team.color }))}
          punten={vrijdag}
          tabel={settings.zeskampPoints}
        />
      </section>

      <section id="tabel" aria-labelledby="tabel-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="tabel-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Puntentabel
        </h2>
        <PuntentabelFormulier tabel={settings.zeskampPoints} />
      </section>
    </>
  );
}
