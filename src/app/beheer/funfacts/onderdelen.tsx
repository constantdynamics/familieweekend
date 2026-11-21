"use client";

import { useActionState, useId, useState } from "react";
import { IconVinkje } from "@/components/ui/icons";
import { IconToverstaf } from "@/components/ui/icons-funfacts";
import { Keuzelijst, Tekstvak, Vinkje } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { uploadFoto } from "@/lib/client/foto";
import { FUNFACT_KINDS, KIND_LABELS, type FunfactKind } from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import {
  bewaarVraag,
  kiesQuizversie,
  koppelAiVersie,
  neemOver,
  verwijderAiVersie,
  verwijderVraag,
  type BeheerState,
} from "./actions";

/* ------------------------------------------------------------------------ */
/* Een vraag bewerken of toevoegen                                           */
/* ------------------------------------------------------------------------ */

export type VraagFormulierView = {
  id: string | null;
  kind: FunfactKind;
  text: string;
  hint: string;
  options: string;
  min: string;
  max: string;
  quizForm: string;
  active: boolean;
  /** The kind is fixed once someone answered. */
  heeftAntwoorden: boolean;
};

export function VraagFormulier({ vraag }: { vraag: VraagFormulierView }) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(bewaarVraag, {});
  const [soort, setSoort] = useState<FunfactKind>(vraag.kind);
  const velden = state.velden ?? {};
  return (
    <Kaart className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={vraag.id ?? ""} />
        <Tekstvak label="Vraag" name="vraag" rows={2} maxLength={200} defaultValue={vraag.text} error={velden.vraag} />
        <Veld
          label="Uitleg"
          name="uitleg"
          maxLength={200}
          defaultValue={vraag.hint}
          autoComplete="off"
          hint="Staat onder de vraag, bijvoorbeeld: Een arm, een been of een teen: alles telt. Leeg laten mag."
          error={velden.uitleg}
        />
        {vraag.heeftAntwoorden ? (
          <>
            <input type="hidden" name="soort" value={vraag.kind} />
            <p className="m-0 text-label leading-[1.4]">
              <strong>Soort: {KIND_LABELS[vraag.kind]}.</strong> Er zijn al antwoorden, dus de soort ligt vast.
            </p>
          </>
        ) : (
          <Keuzelijst
            label="Soort vraag"
            name="soort"
            value={soort}
            onChange={(event) => setSoort(event.target.value as FunfactKind)}
            error={velden.soort}
          >
            {FUNFACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Keuzelijst>
        )}
        {soort === "keuze" ? (
          <Tekstvak
            label="Antwoorden, één per regel"
            name="opties"
            rows={5}
            defaultValue={vraag.options}
            hint="Hernoem je een antwoord op dezelfde plek, dan gaan de antwoorden van de familie mee."
            error={velden.opties}
          />
        ) : null}
        {soort === "getal" ? (
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Laagste getal" name="min" inputMode="numeric" defaultValue={vraag.min} error={velden.min} />
            <Veld label="Hoogste getal" name="max" inputMode="numeric" defaultValue={vraag.max} error={velden.max} />
          </div>
        ) : null}
        <Veld
          label="Quizvorm"
          name="quizvorm"
          maxLength={200}
          defaultValue={vraag.quizForm}
          autoComplete="off"
          hint="De vraag in de quiz, bijvoorbeeld: Hoeveel van ons hebben ooit iets gebroken? Daar maakt de app de conceptvraag van."
          error={velden.quizvorm}
        />
        <Vinkje label="Actief: de familie ziet deze vraag" name="actief" defaultChecked={vraag.active} />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met bewaren…" : vraag.id ? "Bewaar vraag" : "Voeg vraag toe"}
        </Knop>
      </form>
    </Kaart>
  );
}

export function VerwijderVraag({ id, heeftAntwoorden }: { id: string; heeftAntwoorden: boolean }) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(verwijderVraag, {});
  const [zeker, setZeker] = useState(false);
  if (heeftAntwoorden) {
    return (
      <p className="m-0 text-label leading-[1.4] text-zand">
        {bijElkaar("Deze vraag heeft al antwoorden. Wil je hem kwijt? Zet hem dan uit met het vinkje Actief.")}
      </p>
    );
  }
  return zeker ? (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Melding tone="fout">Weet je het zeker? De vraag gaat weg.</Melding>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      <div className="flex flex-wrap gap-2">
        <Knop type="submit" size="klein" disabled={pending}>
          Ja, verwijder de vraag
        </Knop>
        <Knop type="button" variant="secundair" size="klein" onClick={() => setZeker(false)}>
          Nee, laat staan
        </Knop>
      </div>
    </form>
  ) : (
    <Knop type="button" variant="tekst" className="self-start" onClick={() => setZeker(true)}>
      Verwijder vraag
    </Knop>
  );
}

/* ------------------------------------------------------------------------ */
/* Conceptvraag overnemen in een ronde                                       */
/* ------------------------------------------------------------------------ */

export function NeemOver({
  id,
  rondes,
  uit,
}: {
  id: string;
  rondes: { number: number; title: string }[];
  /** Why taking over is not possible here (the test environment). */
  uit: string | null;
}) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(neemOver, {});
  if (uit) return <p className="m-0 text-label leading-[1.4]">{bijElkaar(uit)}</p>;
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={id} />
      <Keuzelijst label="In ronde" name="ronde" defaultValue={String(rondes[0]?.number ?? 1)}>
        {rondes.map((ronde) => (
          <option key={ronde.number} value={ronde.number}>
            {ronde.number}. {ronde.title}
          </option>
        ))}
      </Keuzelijst>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig…" : "Neem over"}
      </Knop>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Echt of AI: één foto                                                      */
/* ------------------------------------------------------------------------ */

export type FotoView = {
  id: string;
  naam: string;
  vraag: string;
  echtUrl: string;
  aiUrl: string | null;
  versie: "echt" | "ai" | null;
};

function Plaatje({ url, alt }: { url: string; alt: string }) {
  return (
    <a href={url} target="_blank" rel="noopener" className="block rounded-tegel">
      {/* A signed link that expires: no image optimisation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="aspect-[4/3] w-full rounded-tegel border-[3px] border-studio bg-papier object-cover" />
    </a>
  );
}

export function FotoKaart({ foto }: { foto: FotoView }) {
  const [versieState, versieAction, versiePending] = useActionState<BeheerState, FormData>(kiesQuizversie, {});
  const [weg, wegAction, wegPending] = useActionState<BeheerState, FormData>(verwijderAiVersie, {});
  const [uploaden, setUploaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const inputId = useId();

  async function kies(bestand: File) {
    setUploaden(true);
    setFout(null);
    try {
      const upload = await uploadFoto(bestand, "ai");
      if ("fout" in upload) return setFout(upload.fout);
      const gekoppeld = await koppelAiVersie({ origineel: foto.id, ai: upload.id });
      if (!gekoppeld.ok) setFout(gekoppeld.fout);
    } finally {
      setUploaden(false);
    }
  }

  const keuzes = [
    { waarde: "echt", label: "Echt", kan: true },
    { waarde: "ai", label: "AI-versie", kan: foto.aiUrl !== null },
  ] as const;

  return (
    <Kaart className="flex flex-col gap-3" aria-label={`Foto van ${foto.naam}`}>
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[19px] leading-tight font-extrabold">{foto.naam}</h2>
        <p className="m-0 text-label">{bijElkaar(foto.vraag)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <figure className="m-0 flex flex-col gap-1.5">
          <Plaatje url={foto.echtUrl} alt={`De echte foto van ${foto.naam}`} />
          <figcaption className="text-label font-bold">Echt</figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-1.5">
          {foto.aiUrl ? (
            <Plaatje url={foto.aiUrl} alt={`De AI-versie van de foto van ${foto.naam}`} />
          ) : (
            <label
              htmlFor={inputId}
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-tegel border-[3px] border-dashed border-studio bg-papier p-2 text-center focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-studio"
            >
              <IconToverstaf size={30} />
              <span className="text-[15px] leading-tight font-extrabold" aria-live="polite">
                {uploaden ? (
                  "Bezig…"
                ) : (
                  <>
                    Upload de
                    <br />
                    AI-versie
                  </>
                )}
              </span>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                disabled={uploaden}
                className="sr-only"
                onChange={(event) => {
                  const bestand = event.target.files?.[0];
                  event.target.value = "";
                  if (bestand) void kies(bestand);
                }}
              />
            </label>
          )}
          <figcaption className="text-label font-bold">AI-versie</figcaption>
        </figure>
      </div>
      {fout ? <Melding tone="fout">{fout}</Melding> : null}

      <form action={versieAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={foto.id} />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[15px] font-bold">In de quiz komt</legend>
          <div className="grid grid-cols-2 gap-2">
            {keuzes.map((keuze) => {
              const gekozen = foto.versie === keuze.waarde;
              return (
                <button
                  key={keuze.waarde}
                  type="submit"
                  name="versie"
                  value={keuze.waarde}
                  aria-pressed={gekozen}
                  disabled={versiePending || !keuze.kan}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-tegel border-[3px] border-studio px-3 text-[16px] font-extrabold text-studio disabled:opacity-50 ${
                    gekozen ? (keuze.waarde === "echt" ? "bg-avocado-licht" : "bg-petrol-licht") : "bg-papier"
                  }`}
                >
                  {gekozen ? <IconVinkje size={18} /> : null}
                  {keuze.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="m-0 text-label leading-[1.4]" aria-live="polite">
          {foto.versie === null
            ? "Nog niet gekozen. Deze foto komt pas in de quiz als je een versie kiest."
            : bijElkaar(`Goed antwoord in de quiz: ${foto.versie === "echt" ? "Echt" : "AI"}.`)}
        </p>
        {versieState.fout ? <Melding tone="fout">{versieState.fout}</Melding> : null}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {foto.versie !== null ? (
          <form action={versieAction}>
            <input type="hidden" name="id" value={foto.id} />
            <button type="submit" name="versie" value="geen" className="min-h-11 text-label font-bold text-studio underline underline-offset-4">
              Wis de keuze
            </button>
          </form>
        ) : null}
        {foto.aiUrl ? (
          <>
            <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center text-label font-bold text-studio underline underline-offset-4 focus-within:outline-3 focus-within:outline-studio">
              {uploaden ? "Bezig met uploaden…" : "Vervang de AI-versie"}
              <input
                id={inputId}
                type="file"
                accept="image/*"
                disabled={uploaden}
                className="sr-only"
                onChange={(event) => {
                  const bestand = event.target.files?.[0];
                  event.target.value = "";
                  if (bestand) void kies(bestand);
                }}
              />
            </label>
            <form action={wegAction}>
              <input type="hidden" name="id" value={foto.id} />
              <button type="submit" disabled={wegPending} className="min-h-11 text-label font-bold text-studio underline underline-offset-4">
                Verwijder de AI-versie
              </button>
            </form>
          </>
        ) : null}
      </div>
      {weg.fout ? <Melding tone="fout">{weg.fout}</Melding> : null}
    </Kaart>
  );
}
