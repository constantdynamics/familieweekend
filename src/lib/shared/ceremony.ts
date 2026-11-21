/**
 * The steps of the prize ceremony (SPEC §4.5 "Prijsuitreiking"). Pure: the
 * server turns the final standings into this plan, and every phone shows
 * the step the admin tapped to.
 *
 * intro → each place from the bottom up (teams on a shared place together)
 * → drumroll → the winner(s) with the podium → the final screen.
 */
export type CeremonyStep =
  | { kind: "intro" }
  | { kind: "plaats"; place: number; teams: string[] }
  | { kind: "trom" }
  | { kind: "winnaar"; teams: string[] }
  | { kind: "einde" };

export type CeremonyStepKind = CeremonyStep["kind"];

/** `standings`: every team with its overall place (1, 1, 3, 4 when shared). */
export function ceremonyPlan(standings: readonly { team: string; place: number }[]): CeremonyStep[] {
  const places = [...new Set(standings.map((row) => row.place))].filter((place) => place > 1).sort((a, b) => b - a);
  const steps: CeremonyStep[] = [{ kind: "intro" }];
  for (const place of places) {
    steps.push({ kind: "plaats", place, teams: standings.filter((row) => row.place === place).map((row) => row.team) });
  }
  steps.push(
    { kind: "trom" },
    { kind: "winnaar", teams: standings.filter((row) => row.place === 1).map((row) => row.team) },
    { kind: "einde" },
  );
  return steps;
}

/** Index of the first step of this kind, or -1. */
export function stepIndex(plan: readonly CeremonyStep[], kind: CeremonyStepKind): number {
  return plan.findIndex((step) => step.kind === kind);
}

/** What the admin's button says to go from `step` to the next one. */
export function nextStepLabel(plan: readonly CeremonyStep[], step: number): string {
  const next = plan[step + 1];
  if (!next) return "Sluit de prijsuitreiking af";
  switch (next.kind) {
    case "plaats":
      return `Onthul plaats ${next.place}`;
    case "trom":
      return "Tromgeroffel!";
    case "winnaar":
      return next.teams.length > 1 ? "Onthul de winnaars" : "Onthul de winnaar";
    case "einde":
      return "Naar de eindstand";
    case "intro":
      return "Begin";
  }
}

/** Places not revealed yet at `step` (for "Nog één plaats te gaan"). */
export function hiddenPlaces(plan: readonly CeremonyStep[], step: number): number {
  const winner = stepIndex(plan, "winnaar");
  if (winner === -1 || step >= winner) return 0;
  const shownPlaces = plan.slice(1, step + 1).filter((s) => s.kind === "plaats").length;
  const allPlaces = plan.filter((s) => s.kind === "plaats").length + 1;
  return allPlaces - shownPlaces;
}
