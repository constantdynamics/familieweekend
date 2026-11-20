"use client";

import { useActionState } from "react";
import { Knop } from "@/components/ui/Knop";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Veld } from "@/components/ui/Veld";
import { bewaarInstellingen, type FormState } from "../actions";

type Props = { beginwaarden: Record<string, string> };

export function InstellingenFormulier({ beginwaarden }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(bewaarInstellingen, {});
  const waarden = state.waarden ?? beginwaarden;
  const velden = state.velden ?? {};
  // Remount the fields when the server sends back what was typed.
  const key = JSON.stringify(waarden);

  return (
    <form action={action} className="mt-5 flex flex-col gap-4" noValidate key={key}>
      <Kaart className="flex flex-col gap-4">
        <h2 className="m-0 text-[19px] font-extrabold">Het weekend</h2>
        <DatumTijd
          label="Aftrap"
          hint="Hier telt de klok op Thuis naartoe."
          datum={{ name: "start_datum", value: waarden.start_datum }}
          tijd={{ name: "start_tijd", value: waarden.start_tijd }}
          error={velden.start}
        />
        <DatumTijd
          label="Einde van het weekend"
          hint="Daarna toont Thuis de eindstand."
          datum={{ name: "eind_datum", value: waarden.eind_datum }}
          tijd={{ name: "eind_tijd", value: waarden.eind_tijd }}
          error={velden.eind}
        />
      </Kaart>

      <Kaart className="flex flex-col gap-4">
        <h2 className="m-0 text-[19px] font-extrabold">Locatie</h2>
        <Veld label="Naam van de locatie" name="locatie" defaultValue={waarden.locatie} error={velden.locatie} maxLength={80} />
        <Veld label="Plaats" name="plaats" defaultValue={waarden.plaats} error={velden.plaats} maxLength={80} />
        <div className="grid grid-cols-2 gap-3">
          <Veld
            label="Breedtegraad"
            name="breedtegraad"
            inputMode="decimal"
            defaultValue={waarden.breedtegraad}
            error={velden.breedtegraad}
          />
          <Veld
            label="Lengtegraad"
            name="lengtegraad"
            inputMode="decimal"
            defaultValue={waarden.lengtegraad}
            error={velden.lengtegraad}
          />
        </div>
        <p className="m-0 text-label leading-[1.4]">De coördinaten gebruikt de app voor het weerbericht.</p>
      </Kaart>

      <Kaart className="flex flex-col gap-4">
        <h2 className="m-0 text-[19px] font-extrabold">Fun facts</h2>
        <DatumTijd
          label="Deadline"
          hint="Tot dit moment kan iedereen zijn antwoorden aanpassen."
          datum={{ name: "deadline_datum", value: waarden.deadline_datum }}
          tijd={{ name: "deadline_tijd", value: waarden.deadline_tijd }}
          error={velden.deadline}
        />
      </Kaart>

      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}

      <Knop type="submit" size="groot" disabled={pending} className="w-full">
        {pending ? "Bezig met bewaren…" : "Bewaar instellingen"}
      </Knop>
    </form>
  );
}

function DatumTijd({
  label,
  hint,
  datum,
  tijd,
  error,
}: {
  label: string;
  hint: string;
  datum: { name: string; value?: string };
  tijd: { name: string; value?: string };
  error?: string;
}) {
  const base = `veld-${datum.name}`;
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0" aria-describedby={`${base}-hint${error ? ` ${base}-fout` : ""}`}>
      <legend className="mb-1.5 p-0 text-[15px] font-bold">{label}</legend>
      <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="sr-only">{label}: datum</span>
          <input
            type="date"
            name={datum.name}
            defaultValue={datum.value}
            aria-invalid={error ? true : undefined}
            className="min-h-[52px] w-full min-w-0 rounded-tegel border-[3px] border-studio bg-papier px-2.5 text-[16px] text-studio aria-invalid:border-roest"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="sr-only">{label}: tijd</span>
          <input
            type="time"
            name={tijd.name}
            defaultValue={tijd.value}
            aria-invalid={error ? true : undefined}
            className="min-h-[52px] w-full min-w-0 rounded-tegel border-[3px] border-studio bg-papier px-2.5 text-[16px] text-studio aria-invalid:border-roest"
          />
        </label>
      </div>
      <p id={`${base}-hint`} className="m-0 text-label">
        {hint} Tijden zijn Nederlandse tijd.
      </p>
      {error ? (
        <p id={`${base}-fout`} className="m-0 text-label font-bold text-roest">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
