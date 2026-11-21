"use client";

import { useState } from "react";
import { IconWisTerug } from "@/components/ui/icons-quiz";
import { Knop } from "@/components/ui/Knop";

/**
 * A big number keypad for estimates (SPEC §4.6, schatting): thumb-sized
 * keys, a comma for halves, and the number in large display digits. Typing
 * on the phone's own keyboard works too (the field below the display).
 */
const TOETSEN = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "wis"] as const;

export function leesGetal(tekst: string): number | null {
  if (!/^\d{1,12}(,\d{1,2})?$/.test(tekst)) return null;
  const value = Number(tekst.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function toonGetal(value: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}

type Props = {
  eenheid: string | null;
  /** The number sent earlier, to start from. */
  verstuurd: number | null;
  bezig: boolean;
  onVerstuur: (value: number) => void;
};

export function Toetsenbord({ eenheid, verstuurd, bezig, onVerstuur }: Props) {
  const [tekst, setTekst] = useState(verstuurd === null ? "" : String(verstuurd).replace(".", ","));
  const waarde = leesGetal(tekst);
  const druk = (toets: (typeof TOETSEN)[number]) => {
    if (toets === "wis") return setTekst((t) => t.slice(0, -1));
    setTekst((t) => {
      if (toets === ",") return t === "" || t.includes(",") ? t : `${t},`;
      const volgende = t === "0" ? toets : `${t}${toets}`;
      return /^\d{1,12}(,\d{0,2})?$/.test(volgende) ? volgende : t;
    });
  };
  const anders = waarde !== null && waarde !== verstuurd;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[76px] items-center justify-between gap-3 rounded-kaart bg-studio-diep px-5 shadow-inzet" aria-hidden="true">
        <span className="font-display text-[40px] leading-none text-beeldbuis cijfers">{tekst === "" ? "…" : tekst}</span>
        {eenheid ? <span className="text-[17px] font-bold text-zand">{eenheid}</span> : null}
      </div>
      <label className="sr-only" htmlFor="schatting-invoer">
        Jullie schatting{eenheid ? ` in ${eenheid}` : ""}
      </label>
      <input
        id="schatting-invoer"
        className="sr-only"
        inputMode="decimal"
        autoComplete="off"
        value={tekst}
        onChange={(event) => {
          const next = event.target.value.replace(".", ",").replace(/[^\d,]/g, "");
          if (next === "" || /^\d{1,12}(,\d{0,2})?$/.test(next)) setTekst(next);
        }}
      />
      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Cijfers">
        {TOETSEN.map((toets) => (
          <button
            key={toets}
            type="button"
            onClick={() => druk(toets)}
            aria-label={toets === "wis" ? "Wis het laatste cijfer" : toets === "," ? "Komma" : toets}
            className="flex h-[58px] items-center justify-center rounded-tegel bg-beeldbuis text-[26px] font-extrabold text-studio shadow-tegel active:translate-y-0.5"
          >
            {toets === "wis" ? <IconWisTerug size={26} /> : toets}
          </button>
        ))}
      </div>
      <Knop size="groot" disabled={bezig || waarde === null || !anders} onClick={() => waarde !== null && onVerstuur(waarde)}>
        {bezig ? "Bezig met versturen…" : verstuurd !== null && !anders ? "Verstuurd" : verstuurd !== null ? "Verstuur je nieuwe schatting" : "Verstuur je schatting"}
      </Knop>
    </div>
  );
}
