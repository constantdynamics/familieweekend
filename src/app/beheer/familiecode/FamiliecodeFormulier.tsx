"use client";

import { useActionState, useState } from "react";
import { Knop } from "@/components/ui/Knop";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Veld } from "@/components/ui/Veld";
import { suggestFamilyCode } from "@/lib/shared/codes";
import { wijzigFamiliecode, type FormState } from "../actions";

export function FamiliecodeFormulier() {
  const [state, action, pending] = useActionState<FormState, FormData>(wijzigFamiliecode, {});
  const [voorstel, setVoorstel] = useState<string | null>(null);
  const waarden = voorstel ? { code: voorstel, herhaal: voorstel } : (state.waarden ?? {});
  const key = `${voorstel ?? ""}|${JSON.stringify(state.waarden ?? {})}|${state.gelukt ?? ""}`;

  return (
    <form action={action} className="mt-5 flex flex-col gap-4" noValidate key={key}>
      <Kaart className="flex flex-col gap-4">
        <Veld
          label="Nieuwe familiecode"
          name="code"
          groot
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          defaultValue={waarden.code}
          error={state.velden?.code}
          hint="Minstens 6 letters of cijfers. Hoofdletters, spaties en streepjes maken niet uit."
        />
        <Veld
          label="Herhaal de nieuwe code"
          name="herhaal"
          groot
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          defaultValue={waarden.herhaal}
          error={state.velden?.herhaal}
        />
        <Knop
          variant="secundair-licht"
          onClick={() => setVoorstel(suggestFamilyCode())}
          className="self-start"
        >
          Bedenk er een voor me
        </Knop>
      </Kaart>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" size="groot" disabled={pending} className="w-full" onClick={() => setVoorstel(null)}>
        {pending ? "Bezig met wijzigen…" : "Wijzig de familiecode"}
      </Knop>
    </form>
  );
}
