"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Knop } from "@/components/ui/Knop";
import { Kaart } from "@/components/ui/Kaart";
import { Veld } from "@/components/ui/Veld";
import { useGehydrateerd } from "@/lib/client/gehydrateerd";
import { logIn, type FormState } from "./actions";

export function PinLogin() {
  const [state, action, pending] = useActionState<FormState, FormData>(logIn, {});
  const klaar = useGehydrateerd();
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Beheer</h1>
        <p className="m-0 text-[15px] leading-[1.4] text-zand">Alleen voor de organisatie van de Spelen.</p>
      </div>
      <Kaart aria-labelledby="pin-titel" className="mt-5 flex flex-col gap-3 p-[22px]">
        <h2 id="pin-titel" className="m-0 text-[22px] leading-tight font-extrabold">
          Log in met je PIN
        </h2>
        <form action={action} className="flex flex-col gap-4" noValidate data-klaar={klaar ? "" : undefined}>
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
            required
            error={state.fout}
          />
          <Knop type="submit" size="groot" className="w-full" disabled={pending}>
            {pending ? "Even kijken…" : "Log in"}
          </Knop>
        </form>
        <p className="m-0 text-label leading-[1.4]">
          PIN kwijt? In de handleiding (README, onder Noodherstel) staat hoe je een nieuwe zet.
        </p>
      </Kaart>
      <Link href="/" className="mt-5 inline-flex min-h-11 items-center self-start text-[15px] text-zand underline underline-offset-4">
        Terug naar thuis
      </Link>
    </>
  );
}
