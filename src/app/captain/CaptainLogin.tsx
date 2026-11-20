"use client";

import { useActionState } from "react";
import { Kaart } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { wordCaptain, type CaptainState } from "./actions";

export function CaptainLogin({ terug }: { terug: string }) {
  const [state, action, pending] = useActionState<CaptainState, FormData>(wordCaptain, {});
  return (
    <Kaart aria-labelledby="captain-titel" className="mt-5 flex flex-col gap-3 p-[22px]!">
      <h2 id="captain-titel" className="m-0 text-[22px] leading-tight font-extrabold">
        Log in met de team-PIN
      </h2>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="terug" value={terug} />
        <Veld
          label="Team-PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={8}
          groot
          hint="Die heb je van de organisatie gekregen."
          error={state.fout}
        />
        <Knop type="submit" size="groot" className="w-full" disabled={pending}>
          {pending ? "Even kijken…" : "Word teamtoestel"}
        </Knop>
      </form>
    </Kaart>
  );
}
