import { TEAM_KLEUREN } from "@/components/team/TeamKleur";
import { formatPoints, type Medal } from "@/lib/shared/scoring";
import type { TeamColor } from "@/lib/shared/teams";

/**
 * Points as "96,5", or a blurred placeholder for the admin who wants to be
 * surprised too (the real number is never in the page then).
 */
export function Punten({
  twelfths,
  className = "",
  plus = false,
  eenheid = true,
}: {
  twelfths: number | null;
  className?: string;
  /** Show "+2" for bonus points. */
  plus?: boolean;
  /** Add "punten" for screen readers. */
  eenheid?: boolean;
}) {
  if (twelfths === null) {
    return (
      <span className={className}>
        <span aria-hidden="true" className="inline-block blur-[7px] select-none">
          88
        </span>
        <span className="sr-only">verborgen</span>
      </span>
    );
  }
  const text = formatPoints(twelfths);
  return (
    <span className={`cijfers whitespace-nowrap ${className}`}>
      {plus && twelfths > 0 ? `+${text}` : text}
      {eenheid ? <span className="sr-only">{twelfths === 12 ? " punt" : " punten"}</span> : null}
    </span>
  );
}

export const MEDAILLE_VLAK: Record<Medal, string> = {
  goud: "bg-goud",
  zilver: "bg-zilver",
  brons: "bg-brons",
};

/** The team colour as a bar next to the name (SPEC §6.2: never as text colour). */
export function TeamBalk({ kleur, className = "h-[38px]" }: { kleur: TeamColor; className?: string }) {
  return <span aria-hidden="true" className={`inline-block w-3.5 flex-none rounded-[7px] ${TEAM_KLEUREN[kleur].vlak} ${className}`} />;
}
