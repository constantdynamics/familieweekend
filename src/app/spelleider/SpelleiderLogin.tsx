"use client";

import { useActionState } from "react";
import { Kaart } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { logInSpelleider, type SpelleiderState } from "./actions";

export function SpelleiderLogin() {
  const [state, action, pending] = useActionState<SpelleiderState, FormData>(logInSpelleider, {});
  return (
    <Kaart aria-labelledby="spelleider-titel" className="mt-5 flex flex-col gap-3 p-[22px]!">
      <h2 id="spelleider-titel" className="m-0 text-[22px] leading-tight font-extrabold">
        Log in met je PIN
      </h2>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <Veld
          label="Jouw PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          enterKeyHint="go"
          maxLength={8}
          groot
          hint="Die heb je van de beheerder gekregen."
          error={state.fout}
        />
        <Knop type="submit" size="groot" className="w-full" disabled={pending}>
          {pending ? "Even kijken…" : "Log in"}
        </Knop>
      </form>
    </Kaart>
  );
}
