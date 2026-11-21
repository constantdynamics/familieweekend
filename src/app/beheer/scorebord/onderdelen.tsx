"use client";

import { useActionState, useState } from "react";
import { Keuzelijst } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { bijElkaar } from "@/lib/shared/tekst";
import { geefPunten, zetSlot, type ScorebordState } from "./actions";

/** Close the lock now, or open it (only with an explicit tick). */
export function SlotKnop({ dicht }: { dicht: boolean }) {
  const [state, action, pending] = useActionState<ScorebordState, FormData>(zetSlot, {});
  const [zeker, setZeker] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="slot" value={dicht ? "open" : "dicht"} />
      {dicht ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-bold">
          <input
            type="checkbox"
            name="zeker"
            checked={zeker}
            onChange={(event) => setZeker(event.target.checked)}
            className="h-6 w-6 flex-none cursor-pointer accent-oranje"
          />
          {bijElkaar("Ja, iedereen mag de echte stand weer zien")}
        </label>
      ) : null}
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" variant={dicht ? "secundair-licht" : "primair"} disabled={pending || (dicht && !zeker)}>
        {pending ? "Bezig…" : dicht ? "Open het slot" : "Zet het slot nu dicht"}
      </Knop>
    </form>
  );
}

export function PuntenFormulier({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ScorebordState, FormData>(geefPunten, {});
  const velden = state.velden ?? {};
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Losse punten geven of aftrekken</h3>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Keuzelijst label="Team" name="team" defaultValue="" error={velden.team}>
          <option value="" disabled>
            Kies een team
          </option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Keuzelijst>
        <Veld
          label="Punten"
          name="punten"
          inputMode="decimal"
          autoComplete="off"
          placeholder="2"
          hint={bijElkaar("Met een min ervoor trek je punten af, bijvoorbeeld -1. Halve punten mogen: 0,5.")}
          error={velden.punten}
          className="max-w-[220px]"
        />
        <Veld label="Reden" name="reden" maxLength={200} autoComplete="off" placeholder="Mooiste teamyel" error={velden.reden} />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig…" : "Bewaar de punten"}
        </Knop>
      </form>
    </Kaart>
  );
}
