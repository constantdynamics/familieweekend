"use client";

import { useState, useTransition } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { pokeLive, useLive } from "@/lib/client/live";
import type { IntermezzoResult, IntermezzoView } from "@/lib/server/intermezzo";
import type { TeamColor } from "@/lib/shared/teams";
import { kiesWinnaar, loot, lootOpnieuw, speelInHetEcht, stopDuels } from "./actions";

/**
 * The quizmaster's controls for steen, papier, schaar: draw, play for real,
 * tap the winner, draw again, stop. Shown in the quizmaster console while
 * the live mode is "intermezzo".
 */
export function IntermezzoBediening() {
  const { data } = useLive<IntermezzoView>("/api/intermezzo");
  const [pending, startTransition] = useTransition();
  const [fout, setFout] = useState<string | null>(null);

  function doe(actie: () => Promise<IntermezzoResult>) {
    setFout(null);
    startTransition(async () => {
      const result = await actie();
      if ("fout" in result) setFout(result.fout);
      pokeLive();
    });
  }

  if (!data) return <p className="m-0 text-[15px] text-zand">Het intermezzo laden…</p>;
  const duel = data.duel;
  const lopend = duel && (duel.status === "kiezen" || duel.status === "aftellen" || duel.status === "gelijk");
  const max = data.maxDuels ? ` van ${data.maxDuels}` : "";

  return (
    <section aria-labelledby="bediening-intermezzo" className="op-licht flex flex-col gap-3 rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart">
      <h2 id="bediening-intermezzo" className="m-0 text-[20px] font-extrabold">
        Intermezzo bedienen
      </h2>
      <p className="m-0 text-label">
        {data.duelCount === 1 ? "1 duel gespeeld" : `${data.duelCount} duels gespeeld`}
        {max}
        {data.longest ? ` · Langste reeks: ${data.longest.name}, ${data.longest.count}` : ""}
      </p>

      {duel ? (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-tegel border-[3px] border-studio bg-papier p-3">
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-bold">
            <TeamVlak kleur={duel.champion.teamColor as TeamColor} className="h-4 w-4" />
            {duel.champion.name}
            <span className="font-medium">tegen</span>
            <TeamVlak kleur={duel.challenger.teamColor as TeamColor} className="h-4 w-4" />
            {duel.challenger.name}
          </p>
          <p className="m-0 text-label">
            {duel.inRealLife
              ? "In het echt: tik de winnaar aan."
              : duel.status === "kiezen"
                ? `${duel.championChose ? `${duel.champion.name} heeft gekozen. ` : ""}${duel.challengerChose ? `${duel.challenger.name} heeft gekozen.` : ""}` ||
                  "Ze kiezen in het geheim…"
                : duel.status === "aftellen"
                  ? "Allebei gekozen. De telefoons tellen af."
                  : duel.status === "gelijk"
                    ? "Gelijkspel. Ze kiezen opnieuw."
                    : duel.winnerId
                      ? `${duel.winnerId === duel.champion.id ? duel.champion.name : duel.challenger.name} wint.`
                      : ""}
          </p>
          {duel.inRealLife && duel.status === "kiezen" ? (
            <div className="grid grid-cols-2 gap-2">
              <Knop size="klein" disabled={pending} onClick={() => doe(() => kiesWinnaar(duel.champion.id))}>
                {duel.champion.name} wint
              </Knop>
              <Knop size="klein" disabled={pending} onClick={() => doe(() => kiesWinnaar(duel.challenger.id))}>
                {duel.challenger.name} wint
              </Knop>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!lopend ? (
          <Knop disabled={pending} onClick={() => doe(loot)}>
            {duel?.status === "klaar" ? "Loot de volgende uitdager" : "Loot de eerste twee"}
          </Knop>
        ) : null}
        {lopend && !duel?.inRealLife ? (
          <Knop variant="secundair-licht" size="klein" disabled={pending} onClick={() => doe(speelInHetEcht)}>
            In het echt spelen
          </Knop>
        ) : null}
        {lopend ? (
          <Knop variant="secundair-licht" size="klein" disabled={pending} onClick={() => doe(lootOpnieuw)}>
            Loot opnieuw
          </Knop>
        ) : null}
        <Knop variant="secundair-licht" size="klein" disabled={pending} onClick={() => doe(stopDuels)}>
          Stop de duels
        </Knop>
      </div>
      {fout ? <Melding tone="fout">{fout}</Melding> : null}
      <p className="m-0 text-label leading-[1.4]">Klaar? Stop de duels en ga terug naar de quiz.</p>
    </section>
  );
}
