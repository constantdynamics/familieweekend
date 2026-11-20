"use client";

import { useActionState, useState } from "react";
import { Keuzelijst, Vinkje } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { bewaarDeelnemer, geefNaamVrij, verwijderDeelnemer, type BeheerState } from "../actions";

type Props = {
  deelnemer: {
    id: string;
    name: string;
    nickname: string;
    teamId: string;
    isChild: boolean;
    isCaptain: boolean;
    claimed: boolean;
  } | null;
  teams: { id: string; name: string }[];
};

export function DeelnemerFormulier({ deelnemer, teams }: Props) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(bewaarDeelnemer, {});
  const [zeker, setZeker] = useState(false);
  const velden = state.velden ?? {};
  return (
    <div className="mt-5 flex flex-col gap-4">
      <Kaart className="flex flex-col gap-3">
        <form action={action} className="flex flex-col gap-3" noValidate>
          <input type="hidden" name="id" value={deelnemer?.id ?? ""} />
          <Veld label="Naam" name="naam" defaultValue={deelnemer?.name} maxLength={60} autoComplete="off" error={velden.naam} />
          <Veld
            label="Roepnaam"
            name="roepnaam"
            defaultValue={deelnemer?.nickname}
            maxLength={30}
            autoComplete="off"
            hint="Zo noemt de app iemand, bijvoorbeeld in de quiz. Leeg laten mag."
            error={velden.roepnaam}
          />
          <Keuzelijst label="Team" name="team" defaultValue={deelnemer?.teamId ?? ""}>
            <option value="">Nog geen team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Keuzelijst>
          <Vinkje label="Is een kind" name="kind" defaultChecked={deelnemer?.isChild} hint="Een ouder vult dan meestal in." />
          <Vinkje label="Captain van het team" name="captain" defaultChecked={deelnemer?.isCaptain} />
          {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
          <Knop type="submit" disabled={pending}>
            {pending ? "Bezig met bewaren…" : deelnemer ? "Bewaar deelnemer" : "Voeg deelnemer toe"}
          </Knop>
        </form>
      </Kaart>

      {deelnemer?.claimed ? (
        <Kaart className="flex flex-col gap-2">
          <h2 className="m-0 text-[18px] font-extrabold">Naamkoppeling</h2>
          <p className="m-0 text-[15px] leading-[1.45]">
            Deze naam hoort bij één toestel. Heeft iemand een nieuwe telefoon, of koos iemand per ongeluk deze naam? Geef
            hem dan vrij, zodat de juiste persoon hem kan kiezen.
          </p>
          <form action={geefNaamVrij}>
            <input type="hidden" name="id" value={deelnemer.id} />
            <Knop type="submit" variant="secundair-licht" size="klein">
              Geef naam vrij
            </Knop>
          </form>
        </Kaart>
      ) : null}

      {deelnemer ? (
        <div className="flex flex-col gap-2">
          {zeker ? (
            <form action={verwijderDeelnemer} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={deelnemer.id} />
              <Melding tone="fout">Weet je het zeker? Ook de fun facts van {deelnemer.name} gaan weg.</Melding>
              <div className="flex flex-wrap gap-2">
                <Knop type="submit" size="klein">
                  Ja, verwijder {deelnemer.name}
                </Knop>
                <Knop type="button" variant="secundair" size="klein" onClick={() => setZeker(false)}>
                  Nee, laat staan
                </Knop>
              </div>
            </form>
          ) : (
            <Knop type="button" variant="tekst" className="self-start" onClick={() => setZeker(true)}>
              Verwijder deelnemer
            </Knop>
          )}
        </div>
      ) : null}
    </div>
  );
}
