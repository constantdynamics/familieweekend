"use client";

import { useActionState, useState } from "react";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { bijElkaar } from "@/lib/shared/tekst";
import { ruimAllesOp, type OpruimState } from "./actions";

/** Two steps: first say you want to, then type OPRUIMEN. */
export function Opruimen() {
  const [state, action, pending] = useActionState<OpruimState, FormData>(ruimAllesOp, {});
  const [stap, setStap] = useState(1);
  if (state.gelukt) return <Melding tone="goed">{state.gelukt}</Melding>;
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-extrabold">Alles opruimen</h2>
      <ul className="m-0 flex flex-col gap-1 pl-5 text-[15px] leading-[1.45]">
        <li>alle antwoorden op de fun facts;</li>
        <li>{bijElkaar("alle foto's van de fun facts, met hun AI-versies;")}</li>
        <li>welke naam bij welke telefoon hoort.</li>
      </ul>
      <p className="m-0 text-[15px] leading-[1.45]">
        Het prikbord, de deelnemerslijst, de teams, de uitslagen en het logboek blijven staan. Dit kun je niet
        terugdraaien.
      </p>
      {stap === 1 ? (
        <Knop type="button" className="self-start" onClick={() => setStap(2)}>
          Ik wil alles opruimen
        </Knop>
      ) : (
        <form action={action} className="flex flex-col gap-3" noValidate>
          <Veld
            label="Typ OPRUIMEN om te bevestigen"
            name="bevestiging"
            autoComplete="off"
            autoCapitalize="characters"
            error={state.fout}
          />
          <div className="flex flex-wrap gap-2">
            <Knop type="submit" disabled={pending}>
              {pending ? "Bezig met opruimen…" : "Ruim alles op"}
            </Knop>
            <Knop type="button" variant="secundair-licht" onClick={() => setStap(1)}>
              Toch niet
            </Knop>
          </div>
        </form>
      )}
    </Kaart>
  );
}
