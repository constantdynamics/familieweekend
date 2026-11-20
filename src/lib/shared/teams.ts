/** The four team colours (SPEC §6.2). */
export const TEAM_COLORS = ["oranje", "mosterd", "avocado", "petrol"] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];
