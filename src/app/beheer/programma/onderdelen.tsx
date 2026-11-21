"use client";

import { useActionState, useState } from "react";
import { Keuzelijst } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { PROGRAM_KIND_LABELS, PROGRAM_KINDS, PROGRAM_LIMITS, type ProgramFormValues } from "@/lib/shared/program";
import { bewaarOnderdeel, verwijderOnderdeel, voegOnderdeelToe, type ProgrammaState } from "./actions";

type Props = {
  /** Null for a new item. */
  id: string | null;
  beginwaarden: ProgramFormValues;
  dagen: { key: string; long: string }[];
};

/** Add or change one item of the program. */
export function ProgrammaFormulier({ id, beginwaarden, dagen }: Props) {
  const [state, action, pending] = useActionState<ProgrammaState, FormData>(id ? bewaarOnderdeel : voegOnderdeelToe, {});
  // After an error the typed values come back; after an add only the day and the kind.
  const waarden: ProgramFormValues = { ...beginwaarden, ...state.waarden };
  const velden = state.velden ?? {};
  // Remount the fields when the server sends values back (after an error or an add).
  const key = JSON.stringify(state);

  return (
    <form action={action} className="flex flex-col gap-3.5" noValidate key={key}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <Keuzelijst label="Dag" name="dag" defaultValue={waarden.dag} error={velden.dag}>
        {dagen.map((dag) => (
          <option key={dag.key} value={dag.key}>
            {dag.long}
          </option>
        ))}
      </Keuzelijst>
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Begin" name="begin" type="time" defaultValue={waarden.begin} error={velden.begin} required />
        <Veld label="Eind" name="eind" type="time" defaultValue={waarden.eind} error={velden.eind} hint="Mag leeg" />
      </div>
      <Veld
        label="Titel"
        name="titel"
        defaultValue={waarden.titel}
        maxLength={PROGRAM_LIMITS.title}
        autoComplete="off"
        error={velden.titel}
        required
      />
      <Veld
        label="Ondertitel"
        name="ondertitel"
        defaultValue={waarden.ondertitel}
        maxLength={PROGRAM_LIMITS.subtitle}
        autoComplete="off"
        hint="Bijvoorbeeld: Neem droge sokken mee. Mag leeg."
        error={velden.ondertitel}
      />
      <Veld
        label="Plek"
        name="plek"
        defaultValue={waarden.plek}
        maxLength={PROGRAM_LIMITS.location}
        autoComplete="off"
        hint="Bijvoorbeeld: Op het grasveld. Mag leeg."
        error={velden.plek}
      />
      <Keuzelijst
        label="Soort"
        name="soort"
        defaultValue={waarden.soort}
        error={velden.soort}
        hint="Quiz, zeskamp en prijsuitreiking linken door naar hun eigen scherm. Moederdag krijgt een bloem."
      >
        {PROGRAM_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {PROGRAM_KIND_LABELS[kind]}
          </option>
        ))}
      </Keuzelijst>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" disabled={pending}>
        {pending ? "Bezig met bewaren…" : id ? "Bewaar onderdeel" : "Voeg onderdeel toe"}
      </Knop>
    </form>
  );
}

/** Delete, after a second tap. */
export function VerwijderOnderdeel({ id, titel, dag }: { id: string; titel: string; dag: string }) {
  const [zeker, setZeker] = useState(false);
  if (!zeker) {
    return (
      <Knop type="button" variant="tekst" className="self-start" onClick={() => setZeker(true)}>
        Verwijder onderdeel
      </Knop>
    );
  }
  return (
    <form action={verwijderOnderdeel} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dag" value={dag} />
      <Melding tone="fout">Weet je het zeker? {titel} verdwijnt meteen van alle telefoons.</Melding>
      <div className="flex flex-wrap gap-2">
        <Knop type="submit" size="klein">
          Ja, verwijder onderdeel
        </Knop>
        <Knop type="button" variant="secundair" size="klein" onClick={() => setZeker(false)}>
          Nee, laat staan
        </Knop>
      </div>
    </form>
  );
}

/** A card around the form, used on the list page and the edit page. */
export function FormulierKaart({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[19px] font-extrabold">{titel}</h2>
      {children}
    </Kaart>
  );
}
