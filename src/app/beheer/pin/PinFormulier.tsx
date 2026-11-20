"use client";

import { useActionState } from "react";
import { Knop } from "@/components/ui/Knop";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Veld } from "@/components/ui/Veld";
import { wijzigPin, type FormState } from "../actions";

const pinVeld = {
  type: "password",
  inputMode: "numeric",
  pattern: "[0-9]*",
  maxLength: 8,
  groot: true,
} as const;

export function PinFormulier() {
  const [state, action, pending] = useActionState<FormState, FormData>(wijzigPin, {});
  return (
    <form action={action} className="mt-5 flex flex-col gap-4" noValidate key={state.gelukt ?? "open"}>
      <Kaart className="flex flex-col gap-4">
        <Veld label="Je huidige PIN" name="huidig" autoComplete="current-password" error={state.velden?.huidig} {...pinVeld} />
        <Veld
          label="Nieuwe PIN"
          name="nieuw"
          autoComplete="new-password"
          hint="Zes cijfers, geen reeks zoals 123456."
          error={state.velden?.nieuw}
          {...pinVeld}
        />
        <Veld label="Herhaal de nieuwe PIN" name="herhaal" autoComplete="new-password" error={state.velden?.herhaal} {...pinVeld} />
      </Kaart>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" size="groot" disabled={pending} className="w-full">
        {pending ? "Bezig met wijzigen…" : "Wijzig mijn PIN"}
      </Knop>
    </form>
  );
}
