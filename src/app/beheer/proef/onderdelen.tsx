"use client";

import { useActionState, useState } from "react";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { PinOnthulling } from "@/components/ui/PinOnthulling";
import { maakProefLeeg, maakUitnodiging, zetProefKlaar, type ProefState } from "./actions";

export function ProefKlaarzetten({ bestaat }: { bestaat: boolean }) {
  const [state, action, pending] = useActionState<ProefState>(zetProefKlaar, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-extrabold">{bestaat ? "Begin de proef opnieuw" : "Zet de proef klaar"}</h2>
      <p className="m-0 text-[15px] leading-[1.45]">
        Vier proefteams met nieuwe team-PIN&apos;s, twaalf testnamen en dezelfde onderdelen als het echte weekend.
        {bestaat ? " Wat er nu in de proef staat, gaat weg." : ""}
      </p>
      <form action={action}>
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig…" : bestaat ? "Begin opnieuw" : "Zet de proef klaar"}
        </Knop>
      </form>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      {state.pins ? (
        <div className="flex flex-col gap-2">
          {state.pins.map((p) => (
            <PinOnthulling key={p.team} pin={p.pin} voor={p.team} />
          ))}
        </div>
      ) : null}
    </Kaart>
  );
}

export function Uitnodiging() {
  const [state, action, pending] = useActionState<ProefState>(maakUitnodiging, {});
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-extrabold">Nodig een toestel uit</h2>
      <p className="m-0 text-[15px] leading-[1.45]">
        Met deze link doet een andere telefoon een dag mee met de proef, bijvoorbeeld als captain van een proefteam. Die
        telefoon moet de familiecode al hebben ingevuld.
      </p>
      <form action={action}>
        <Knop type="submit" variant="secundair-licht" disabled={pending}>
          {pending ? "Bezig…" : "Maak een uitnodigingslink"}
        </Knop>
      </form>
      {state.link ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 rounded-tegel border-[3px] border-studio bg-papier px-3 py-2 text-[14px] break-all">{state.link}</p>
          <div className="flex flex-wrap gap-2">
            <Knop
              type="button"
              size="klein"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setGekopieerd(true);
                } catch {
                  setGekopieerd(false);
                }
              }}
            >
              {gekopieerd ? "Gekopieerd" : "Kopieer link"}
            </Knop>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Knop
                type="button"
                size="klein"
                variant="secundair-licht"
                onClick={() => navigator.share({ title: "Doe mee met de proef", url: state.link! }).catch(() => {})}
              >
                Deel link
              </Knop>
            ) : null}
          </div>
        </div>
      ) : null}
    </Kaart>
  );
}

export function ProefLeegmaken() {
  const [state, action, pending] = useActionState<ProefState>(maakProefLeeg, {});
  const [zeker, setZeker] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {zeker ? (
        <form action={action} className="flex flex-wrap gap-2" onSubmit={() => setZeker(false)}>
          <Knop type="submit" size="klein" disabled={pending}>
            Ja, maak de proef leeg
          </Knop>
          <Knop type="button" size="klein" variant="secundair" onClick={() => setZeker(false)}>
            Nee, laat staan
          </Knop>
        </form>
      ) : (
        <Knop type="button" variant="secundair" className="self-start" onClick={() => setZeker(true)}>
          Maak de proef leeg
        </Knop>
      )}
    </div>
  );
}
