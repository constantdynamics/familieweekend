import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Punten, TeamBalk } from "@/components/score/Punten";
import { Kaart } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import { adminWantsSurprise, getScoreboard } from "@/lib/server/scoreboard";
import { requireAdmin } from "@/lib/server/session";
import { getGame, latestEntries } from "@/lib/server/zeskamp";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import { formatDecimal, formatSeconds, isResultType, placeText, STATUS_LABELS } from "@/lib/shared/zeskamp";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../onderdelen";
import { JokerFormulier, SpelFormulier, TerugzettenFormulier, UitslagFormulier, VerwijderFormulier } from "../onderdelen";

export const metadata: Metadata = { title: "Spel beheren" };

export default function SpelBeheerPage({ params }: PageProps<"/beheer/zeskamp/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/zeskamp/[id]">["params"] }) {
  await requireAdmin();
  const ctx = await getRequestContext();
  const { id } = await params;
  const game = await getGame(ctx.env, id);
  if (!game) notFound();
  const live = await readLiveState(ctx.env);
  const [board, surprise, entries] = await Promise.all([getScoreboard(ctx.env, live), adminWantsSurprise(), latestEntries(ctx.env)]);
  const type = isResultType(game.resultType) ? game.resultType : null;
  const placements = board.games[game.id] ?? [];
  const teams = board.teams.map((team) => ({ id: team.id, name: team.name, color: team.color }));
  const entry = entries[game.id];
  const waarden = Object.fromEntries(
    placements
      .filter((row) => row.value !== null)
      .map((row) => [row.teamId, type === "tijd" ? formatSeconds(row.value!) : formatDecimal(row.value!, 2)]),
  );
  const zeskampJokers = board.jokers.filter((joker) => joker.kind === "zeskamp");
  const hier = teams.filter((team) => zeskampJokers.some((joker) => joker.teamId === team.id && joker.partId === game.id));
  const elders = Object.fromEntries(
    zeskampJokers.filter((joker) => joker.partId !== game.id).map((joker) => [joker.teamId, joker.partName]),
  );

  const status = [
    STATUS_LABELS[game.status],
    game.startedAt ? `gestart om ${formatTime(new Date(game.startedAt))}${game.startedBy ? ` door ${game.startedBy}` : ""}` : null,
    entry ? `uitslag van ${entry.by} om ${formatTime(new Date(entry.at))}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <BeheerKop titel={game.name} sub={`Spel ${game.number} van ${game.total}`} terug={{ href: "/beheer/zeskamp", label: "Zeskamp" }} />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <div className="mt-5 flex flex-col gap-4">
        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">Status</h2>
          <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar(`${status}.`)}</p>
          {game.status !== "gepland" ? (
            <div className="border-t-2 border-papier-streep pt-3">
              <p className="m-0 mb-2 text-[15px] leading-[1.45]">{bijElkaar("Per ongeluk gestart? Zet het spel terug. De uitslag verdwijnt, het logboek houdt hem.")}</p>
              <TerugzettenFormulier id={game.id} />
            </div>
          ) : null}
        </Kaart>

        {type ? (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[19px] font-extrabold">Uitslag</h2>
            {placements.length > 0 ? (
              <ol aria-label="Plaatsen en punten" className="m-0 flex list-none flex-col gap-1.5 rounded-[16px] bg-papier p-3 text-[15px]">
                {placements.map((row) => {
                  const team = teams.find((t) => t.id === row.teamId);
                  return (
                    <li key={row.teamId} className="flex items-center gap-2.5">
                      <span className="w-9 flex-none font-extrabold">
                        {surprise ? (
                          <span aria-hidden="true" className="blur-[5px]">
                            8e
                          </span>
                        ) : row.place ? (
                          placeText(row.place)
                        ) : (
                          "–"
                        )}
                      </span>
                      {team ? <TeamBalk kleur={team.color} className="h-6" /> : null}
                      <span className="min-w-0 flex-1 font-bold">
                        {team?.name}
                        {row.joker ? ", joker" : ""}
                        {row.shared && !surprise ? ", gedeeld" : ""}
                      </span>
                      <Punten twelfths={surprise ? null : row.twelfths} className="font-extrabold" />
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="m-0 text-[15px]">{bijElkaar("Nog geen uitslag. Die stuurt de spelleider in, of je vult hem hier in.")}</p>
            )}
            <UitslagFormulier id={game.id} type={type} unit={game.unit} teams={teams} waarden={waarden} />
          </Kaart>
        ) : null}

        {game.jokerAllowed ? (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[19px] font-extrabold">Joker</h2>
            <p className="m-0 text-[15px] leading-[1.45]">
              {bijElkaar("Captains zetten de joker zelf in, tot de start. Jij kunt hem altijd verzetten of weghalen.")}
            </p>
            <JokerFormulier id={game.id} teams={teams} hier={hier} elders={elders} />
          </Kaart>
        ) : null}

        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">Spel wijzigen</h2>
          <SpelFormulier
            spel={{
              id: game.id,
              name: game.name,
              description: game.description,
              sort: game.sort,
              resultType: type,
              unit: game.unit,
              mode: game.mode,
              jokerAllowed: game.jokerAllowed,
            }}
            typeVast={placements.length > 0}
          />
        </Kaart>

        {game.status === "gepland" && placements.length === 0 ? (
          <Kaart className="flex flex-col gap-3">
            <h2 className="m-0 text-[19px] font-extrabold">Spel verwijderen</h2>
            <VerwijderFormulier id={game.id} />
          </Kaart>
        ) : null}
      </div>
    </>
  );
}
