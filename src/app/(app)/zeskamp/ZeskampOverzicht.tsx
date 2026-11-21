"use client";

import { useState, useTransition } from "react";
import { MEDAILLE_VLAK, Punten, TeamBalk } from "@/components/score/Punten";
import { IconJoker, IconVinkje } from "@/components/ui/icons";
import { Melding, SchermTitel } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { pokeLive, useLive } from "@/lib/client/live";
import type { ZeskampGameView, ZeskampView } from "@/lib/server/zeskamp";
import { medalForPlace } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { placeText, STATUS_LABELS } from "@/lib/shared/zeskamp";
import { zetZeskampJoker, type JokerState } from "./actions";

const STATUS_STIJL: Record<ZeskampGameView["status"], string> = {
  gepland: "bg-studio-licht text-beeldbuis",
  bezig: "bg-oranje text-studio",
  klaar: "bg-avocado-licht text-studio",
};

function namen(teams: readonly { team: { name: string } }[]): string {
  const list = teams.map((entry) => entry.team.name);
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} en ${list.at(-1)}`;
}

/** The zeskamp for the family (SPEC §4.9): six games, their status and the jokers. */
export function ZeskampOverzicht({ initial }: { initial: ZeskampView }) {
  const live = useLive<ZeskampView>("/api/zeskamp", initial);
  const view = live.data ?? initial;
  const [state, setState] = useState<JokerState>({});
  const [pending, startTransition] = useTransition();

  const joker = (gameId: string | null) =>
    startTransition(async () => {
      const result = await zetZeskampJoker(gameId);
      setState(result);
      pokeLive();
      live.refresh();
    });

  const aantal = view.games.length;
  const own = view.ownJoker;

  return (
    <>
      <SchermTitel sub={aantal > 0 ? `Zaterdag: ${aantal} spellen, één joker per team` : "Zaterdag, de grote dag"}>Zeskamp</SchermTitel>

      {view.captain && view.ownTeam ? (
        <section aria-labelledby="joker-titel" className="mt-4 flex items-start gap-3 rounded-[18px] bg-mosterd px-4 py-3.5 text-studio">
          <IconJoker size={26} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="joker-titel" className="m-0 text-[17px] leading-tight font-extrabold">
              Jullie joker
            </h2>
            <p className="m-0 text-[15px] leading-[1.4]">
              {own
                ? own.fixed
                  ? bijElkaar(`Ligt vast bij ${own.gameName}. Daar tellen jullie punten dubbel.`)
                  : bijElkaar(`Staat op ${own.gameName}. Tot de start mag je hem nog verplaatsen.`)
                : bijElkaar("Nog niet ingezet. Kies hieronder een spel: daar tellen jullie punten dubbel.")}
            </p>
          </div>
        </section>
      ) : view.ownTeam && own ? (
        <p className="m-0 mt-4 flex items-center gap-2 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] font-bold">
          <IconJoker size={20} />
          {bijElkaar(`De joker van ${view.ownTeam.name} staat op ${own.gameName}.`)}
        </p>
      ) : null}

      <div aria-live="polite" className="mt-3 empty:hidden">
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : state.melding ? <Melding tone="goed">{state.melding}</Melding> : null}
      </div>

      {view.locked ? (
        <p className="m-0 mt-3 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Het scorebord zit op slot. De uitslagen blijven geheim tot de prijsuitreiking.")}
        </p>
      ) : null}

      {aantal === 0 ? (
        <p className="m-0 mt-4 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px]">{bijElkaar("De spellen worden nog gekozen.")}</p>
      ) : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {view.games.map((game) => {
            const mayJoker = view.captain && game.jokerAllowed && game.status === "gepland" && !(own?.fixed ?? false);
            const ownHere = own?.gameId === game.id;
            return (
              <li key={game.id} className="op-licht flex flex-col gap-2.5 rounded-kaart bg-beeldbuis p-4 text-studio shadow-kaart">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd font-display text-[22px]">
                    <span className="sr-only">Spel </span>
                    {game.number}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h2 className="m-0 text-[19px] leading-tight font-extrabold">{bijElkaar(game.name)}</h2>
                    {game.resultLabel ? <p className="m-0 text-[14px] leading-snug">{bijElkaar(`${game.resultLabel}. ${game.modeLabel}.`)}</p> : null}
                  </div>
                  <span className={`inline-flex flex-none items-center gap-1 rounded-pil px-2.5 py-1 text-[14px] font-bold ${STATUS_STIJL[game.status]}`}>
                    {game.status === "klaar" ? <IconVinkje size={15} strokeWidth={3} /> : null}
                    {STATUS_LABELS[game.status]}
                  </span>
                </div>
                {game.description ? <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar(game.description)}</p> : null}
                {game.jokers.length > 0 ? (
                  <p className="m-0 flex items-center gap-2 text-[15px] font-bold">
                    <IconJoker size={18} />
                    {bijElkaar(`Joker: ${namen(game.jokers)}${game.jokers.some((j) => !j.fixed) ? " (nog niet vast)" : ""}`)}
                  </p>
                ) : null}
                {game.results ? <Uitslag game={game} /> : game.status === "klaar" ? (
                  <p className="m-0 text-[14px] leading-[1.4]">{bijElkaar("Gespeeld. De punten volgen bij de prijsuitreiking.")}</p>
                ) : null}
                {mayJoker ? (
                  <div className="pt-1">
                    {ownHere ? (
                      <Knop variant="secundair-licht" size="klein" disabled={pending} onClick={() => joker(null)}>
                        Haal de joker weg
                      </Knop>
                    ) : (
                      <Knop size="klein" disabled={pending} onClick={() => joker(game.id)}>
                        <IconJoker size={18} />
                        {own ? "Zet de joker hier in" : "Zet de joker in"}
                      </Knop>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <p className="m-0 mt-5 text-[14px] leading-[1.45] text-zand">
        {bijElkaar("Elk team zet in de zeskamp één keer de joker in, vóór de start van een spel. Bij dat spel tellen de punten dubbel.")}
      </p>
    </>
  );
}

function Uitslag({ game }: { game: ZeskampGameView }) {
  return (
    <ol aria-label={`Uitslag van ${game.name}`} className="m-0 flex list-none flex-col gap-1 border-t-2 border-papier-streep p-0 pt-2">
      {(game.results ?? []).map((row) => {
        const medal = medalForPlace(row.place);
        return (
          <li key={row.team.id} className="flex items-center gap-2.5 text-[15px]">
            <span className="w-8 flex-none text-center font-extrabold">{row.place ? placeText(row.place) : "–"}</span>
            <TeamBalk kleur={row.team.color} className="h-6" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="font-bold">{row.team.name}</span>
              {row.valueText ? <span className="block text-[13px]">{row.valueText}{row.shared ? ", gedeeld" : ""}{row.joker ? ", met joker" : ""}</span> : null}
            </span>
            {medal ? <span aria-hidden="true" className={`h-4 w-4 flex-none rounded-pil border-2 border-studio ${MEDAILLE_VLAK[medal]}`} /> : null}
            <Punten twelfths={row.twelfths} className="font-extrabold" />
          </li>
        );
      })}
    </ol>
  );
}
