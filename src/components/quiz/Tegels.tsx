"use client";

import type { ReactNode } from "react";
import { AntwoordSymbool, IconCamera, IconVinkje } from "@/components/ui/icons";
import { IconToverstaf } from "@/components/ui/icons-quiz";
import type { Answer, CorrectValue, QuestionType } from "@/lib/server/quiz/types";
import { bijElkaar } from "@/lib/shared/tekst";

/**
 * The answer tiles (SPEC §6.2): always colour, symbol and text. A sun on
 * orange, a flower on mustard, a star on light avocado and a moon on light
 * petrol. Echt of AI has its own two tiles.
 */

export type Tegel = {
  key: string;
  /** The text on the tile. */
  label: string;
  /** For screen readers: "Zon", "Bloem"… */
  naam: string;
  kleur: string;
  symbool: ReactNode;
  antwoord: Answer;
};

const STANDAARD = [
  { naam: "Zon", kleur: "bg-oranje", soort: "zon" },
  { naam: "Bloem", kleur: "bg-mosterd", soort: "bloem" },
  { naam: "Ster", kleur: "bg-avocado-licht", soort: "ster" },
  { naam: "Maan", kleur: "bg-petrol-licht", soort: "maan" },
] as const;

/** The tiles of a question type, or null for the map and estimates. */
export function tegelsVoor(kind: QuestionType, options: string[] | null): Tegel[] | null {
  if (kind === "meerkeuze" || kind === "wie_van_ons" || kind === "schatting_bereik") {
    return (options ?? []).slice(0, 4).map((label, index) => ({
      key: String(index),
      label,
      naam: STANDAARD[index].naam,
      kleur: STANDAARD[index].kleur,
      symbool: <AntwoordSymbool soort={STANDAARD[index].soort} size={30} />,
      antwoord: { choice: index },
    }));
  }
  if (kind === "waar_niet_waar") {
    return [
      { key: "waar", label: "Waar", naam: "Zon", kleur: "bg-oranje", symbool: <AntwoordSymbool soort="zon" size={30} />, antwoord: { bool: true } },
      { key: "niet", label: "Niet waar", naam: "Bloem", kleur: "bg-mosterd", symbool: <AntwoordSymbool soort="bloem" size={30} />, antwoord: { bool: false } },
    ];
  }
  if (kind === "echt_of_ai") {
    return [
      { key: "echt", label: "Echt", naam: "Camera", kleur: "bg-avocado-licht", symbool: <IconCamera size={30} />, antwoord: { realOrAi: "echt" } },
      { key: "ai", label: "AI", naam: "Toverstaf", kleur: "bg-petrol-licht", symbool: <IconToverstaf size={30} />, antwoord: { realOrAi: "ai" } },
    ];
  }
  return null;
}

/** Which tile an answer (or the right answer) points at. */
export function tegelKey(kind: QuestionType, value: Answer | CorrectValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const record = typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (kind === "waar_niet_waar") {
    const bool = typeof value === "boolean" ? value : record?.bool;
    return bool === true ? "waar" : bool === false ? "niet" : null;
  }
  if (kind === "echt_of_ai") {
    const choice = typeof value === "string" ? value : record?.realOrAi;
    return choice === "echt" || choice === "ai" ? choice : null;
  }
  const index = typeof value === "number" ? value : record?.choice;
  return typeof index === "number" ? String(index) : null;
}

function tekstMaat(label: string): string {
  if (label.length <= 5) return "font-display text-[36px] leading-none font-normal";
  if (label.length <= 12) return "text-[22px] leading-tight font-extrabold";
  return "text-[17px] leading-[1.2] font-extrabold";
}

type Props = {
  tegels: Tegel[];
  /** The key of this team's answer. */
  gekozen: string | null;
  /** The key of the right answer, after the reveal. */
  goed: string | null;
  /** "kies": the captain may tap; "kijk": everyone else, or closed. */
  modus: "kies" | "kijk";
  bezig?: boolean;
  onKies?: (tegel: Tegel) => void;
  /** Label for the chosen tile ("Jouw keuze", or "Jullie keuze" for meekijkers after the reveal). */
  keuzeLabel?: string;
};

export function Tegels({ tegels, gekozen, goed, modus, bezig = false, onKies, keuzeLabel = "Jouw keuze" }: Props) {
  const twee = tegels.length === 2;
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0" aria-label="Antwoorden">
      {tegels.map((tegel) => {
        const isGekozen = gekozen === tegel.key;
        const isGoed = goed !== null && goed === tegel.key;
        const isFout = goed !== null && goed !== tegel.key;
        const inhoud = (
          <>
            {/* The colour dims to 35 % at the reveal; the text stays readable (light on the dimmed tile). */}
            <span aria-hidden="true" className={`quiz-tegel-vlak absolute inset-0 rounded-[18px] ${tegel.kleur}`} data-fout={isFout} />
            <span className={`relative flex w-full items-start justify-between ${isFout ? "text-beeldbuis" : ""}`}>{tegel.symbool}</span>
            <span className={`relative block text-left break-words ${tekstMaat(tegel.label)} ${isFout ? "text-beeldbuis" : ""}`}>
              <span className="sr-only">{tegel.naam}: </span>
              {bijElkaar(tegel.label, 12)}
            </span>
            {isGekozen && !isGoed ? (
              <span className="quiz-plof absolute top-2.5 right-2.5 rounded-pil bg-studio px-2.5 py-0.5 text-klein font-bold text-beeldbuis">
                {keuzeLabel}
              </span>
            ) : null}
            {isGoed ? (
              <span className="quiz-plof absolute top-2.5 right-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-pil bg-beeldbuis text-studio">
                <IconVinkje size={20} />
                <span className="sr-only">, het goede antwoord{isGekozen ? `, ${keuzeLabel.toLowerCase()}` : ""}</span>
              </span>
            ) : null}
          </>
        );
        const klassen = `quiz-tegel relative flex w-full flex-col items-start justify-between gap-2 rounded-kaart border-4 bg-studio p-3 pr-3.5 text-studio shadow-tegel ${
          twee ? "min-h-[112px]" : "min-h-[108px]"
        } ${isGekozen || isGoed ? "border-beeldbuis" : "border-transparent"}`;
        return (
          <li key={tegel.key} className="flex">
            {modus === "kies" ? (
              <button
                type="button"
                className={`${klassen} active:translate-y-0.5 disabled:cursor-wait`}
                aria-pressed={isGekozen}
                disabled={bezig}
                data-gekozen={isGekozen}
                onClick={() => onKies?.(tegel)}
              >
                {inhoud}
              </button>
            ) : (
              <div className={klassen} data-gekozen={isGekozen && goed === null}>
                {inhoud}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
