import type { TeamColor } from "@/lib/shared/teams";

/*
 * Team colours (SPEC §6.2), from light to dark so they differ for colour
 * blindness too. The colour is always a block next to the name, never text.
 */
export const TEAM_KLEUREN: Record<TeamColor, { label: string; vlak: string; opVlak: string }> = {
  mosterd: { label: "Mosterd", vlak: "bg-mosterd", opVlak: "text-studio" },
  oranje: { label: "Oranje", vlak: "bg-oranje", opVlak: "text-studio" },
  avocado: { label: "Avocado", vlak: "bg-avocado", opVlak: "text-beeldbuis" },
  petrol: { label: "Petrol", vlak: "bg-petrol", opVlak: "text-beeldbuis" },
};

/** A small colour block, decorative: the team name next to it carries the meaning. */
export function TeamVlak({ kleur, className }: { kleur: TeamColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-5 w-5 flex-none rounded-[6px] border-2 border-studio ${TEAM_KLEUREN[kleur].vlak} ${className ?? ""}`}
    />
  );
}
