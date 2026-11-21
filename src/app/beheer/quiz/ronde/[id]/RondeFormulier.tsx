"use client";

import { useActionState } from "react";
import { Tekstvak, Vinkje } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { bijElkaar } from "@/lib/shared/tekst";
import { bewaarRonde, type QuizState } from "../../actions";

export function RondeFormulier({
  ronde,
}: {
  ronde: { id: string; title: string; intro: string | null; listening: boolean; intermezzoAfter: boolean };
}) {
  const [state, action, pending] = useActionState<QuizState, FormData>(bewaarRonde, {});
  const velden = state.velden ?? {};
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-extrabold">Over deze ronde</h2>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={ronde.id} />
        <Veld label="Titel" name="titel" defaultValue={ronde.title} maxLength={60} error={velden.titel} autoComplete="off" />
        <Tekstvak
          label="Uitleg op het rondescherm"
          name="intro"
          rows={3}
          defaultValue={ronde.intro ?? ""}
          error={velden.intro}
          hint={bijElkaar("Kort en vrolijk. Iedereen ziet dit voordat de eerste vraag komt.")}
        />
        <Vinkje
          label="Luistermodus"
          name="luistermodus"
          defaultChecked={ronde.listening}
          hint={bijElkaar("Meekijkers zien alleen Luister goed, captains zien de antwoorden. Handig bij de muziekronde.")}
        />
        <Vinkje label="Daarna het intermezzo" name="intermezzo" defaultChecked={ronde.intermezzoAfter} hint={bijElkaar("Steen, papier, schaar na deze ronde.")} />
        {state.fout ? <Melding tone="fout">{bijElkaar(state.fout)}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{bijElkaar(state.gelukt)}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met bewaren…" : "Bewaar de ronde"}
        </Knop>
      </form>
    </Kaart>
  );
}
