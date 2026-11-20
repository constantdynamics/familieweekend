"use client";

import { useActionState, useState } from "react";
import { IconPrullenbak, IconReactie, IconVinkje } from "@/components/ui/icons";
import { Tekstvak } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import type { ChecklistItem } from "@/lib/server/checklist";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayMonth, formatTime } from "@/lib/shared/time";
import {
  plaatsNotitie,
  verwijderNotitie,
  verwijderPunt,
  vinkAf,
  voegPuntToe,
  type AfvinkState,
} from "./actions";

type Props = { punten: ChecklistItem[]; ikBen: { name: string; role: "beheerder" | "spelleider" } };

function wanneer(iso: string) {
  const d = new Date(iso);
  return `${formatDayMonth(d)} om ${formatTime(d)}`;
}

function Notities({ punt, ikBen }: { punt: ChecklistItem; ikBen: Props["ikBen"] }) {
  const [state, action, pending] = useActionState<AfvinkState, FormData>(plaatsNotitie, {});
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t-2 border-papier-streep pt-2">
      {punt.notes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {punt.notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-tegel bg-papier px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="m-0 text-label font-bold">
                  {n.author} <span className="font-medium">· {wanneer(n.createdAt)}</span>
                </p>
                <p className="m-0 text-[15px] leading-[1.4] whitespace-pre-line">
                  {n.body
                    .split("\n")
                    .map((regel) => bijElkaar(regel))
                    .join("\n")}
                </p>
              </div>
              {ikBen.role === "beheerder" || n.author === ikBen.name ? (
                <form action={verwijderNotitie}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" aria-label="Verwijder notitie" className="flex h-11 w-11 items-center justify-center rounded-pil">
                    <IconPrullenbak size={18} />
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form action={action} className="flex flex-col gap-2" noValidate>
          <input type="hidden" name="id" value={punt.id} />
          <Tekstvak label={`Notitie van ${ikBen.name}`} name="notitie" rows={3} maxLength={1000} />
          {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
          <div className="flex flex-wrap gap-2">
            <Knop type="submit" size="klein" disabled={pending}>
              {pending ? "Bezig…" : "Plaats notitie"}
            </Knop>
            <Knop type="button" size="klein" variant="secundair-licht" onClick={() => setOpen(false)}>
              Klaar
            </Knop>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-label font-bold text-studio underline underline-offset-4"
        >
          <IconReactie size={18} />
          {punt.notes.length === 0 ? "Notitie plaatsen" : "Nog een notitie"}
        </button>
      )}
    </div>
  );
}

function PuntToevoegen() {
  const [state, action, pending] = useActionState<AfvinkState, FormData>(voegPuntToe, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[19px] font-extrabold">Punt toevoegen</h2>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Veld label="Wat moet er gebeuren?" name="titel" maxLength={120} autoComplete="off" />
        <Tekstvak label="Uitleg" name="uitleg" rows={2} hint="Mag leeg blijven." />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig…" : "Voeg punt toe"}
        </Knop>
      </form>
    </Kaart>
  );
}

/** The checklist with automatic and manual ticks, and notes with names. */
export function Afvinklijst({ punten, ikBen }: Props) {
  const af = punten.filter((p) => p.done).length;
  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="m-0 text-[16px] font-bold" aria-live="polite">
        {af} van de {punten.length} punten zijn af.
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {punten.map((punt) => (
          <li key={punt.id} className="op-licht flex flex-col gap-2 rounded-kaart bg-beeldbuis p-4 text-studio shadow-kaart">
            <div className="flex items-start gap-3">
              {punt.auto ? (
                <span
                  className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-pil border-[3px] border-studio ${
                    punt.done ? "bg-avocado-licht" : "bg-papier"
                  }`}
                  aria-label={punt.done ? "Af, de app ziet het zelf" : "Nog niet af"}
                  role="img"
                >
                  {punt.done ? <IconVinkje size={18} /> : null}
                </span>
              ) : (
                <form action={vinkAf}>
                  <input type="hidden" name="id" value={punt.id} />
                  <input type="hidden" name="af" value={punt.done ? "0" : "1"} />
                  <button
                    type="submit"
                    role="checkbox"
                    aria-checked={punt.done}
                    aria-label={punt.title}
                    className={`-m-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-pil`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-pil border-[3px] border-studio ${
                        punt.done ? "bg-avocado-licht" : "bg-papier"
                      }`}
                    >
                      {punt.done ? <IconVinkje size={18} /> : null}
                    </span>
                  </button>
                </form>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`m-0 text-[17px] leading-tight font-extrabold ${punt.done ? "line-through decoration-2" : ""}`}>
                  {bijElkaar(punt.title)}
                </p>
                {punt.detail ? <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(punt.detail)}</p> : null}
                <p className="m-0 text-label">
                  {bijElkaar(
                    punt.auto
                      ? `De app houdt dit zelf bij${punt.status ? `: ${punt.status}` : ""}.`
                      : punt.done && punt.doneBy && punt.doneAt
                        ? `Afgevinkt door ${punt.doneBy}, ${wanneer(punt.doneAt)}.`
                        : "Vink af als het gedaan is.",
                  )}
                </p>
              </div>
              {ikBen.role === "beheerder" && !punt.auto ? (
                <form action={verwijderPunt}>
                  <input type="hidden" name="id" value={punt.id} />
                  <button type="submit" aria-label={`Verwijder ${punt.title}`} className="flex h-11 w-11 items-center justify-center rounded-pil">
                    <IconPrullenbak size={18} />
                  </button>
                </form>
              ) : null}
            </div>
            <Notities punt={punt} ikBen={ikBen} />
          </li>
        ))}
      </ul>
      {ikBen.role === "beheerder" ? <PuntToevoegen /> : null}
    </div>
  );
}
