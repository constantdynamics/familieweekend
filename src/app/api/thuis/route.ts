import { connection } from "next/server";
import type { ThuisData } from "@/lib/shared/home";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { listProgram } from "@/lib/server/program";
import { getSettings } from "@/lib/server/settings";
import { ownTeams } from "@/lib/server/team-overview";

/**
 * Thuis during the weekend (SPEC §4.1): the program, what runs live, the
 * scoreboard lock and this phone's team with its jokers. Only public fields
 * plus your own team. The phone decides with its own clock what is "now".
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
    const toon = settings.fase2Live || ctx.isAdmin;
    const live = await readLiveState(ctx.env);
    const empty: ThuisData = {
      toon,
      env: ctx.env,
      programma: null,
      live: { mode: live.mode, lockClosed: live.lockClosed, gamesStarted: live.gamesStartedAt !== null },
      teamsZichtbaar: settings.teamsVisible,
      teams: [],
    };
    if (!toon) return Response.json(empty, { headers });
    const [programma, teams] = await Promise.all([
      settings.programVisible || ctx.isAdmin ? listProgram() : Promise.resolve(null),
      ownTeams(ctx, settings),
    ]);
    return Response.json({ ...empty, programma, teams } satisfies ThuisData, { headers });
  } catch (error) {
    logError("api.thuis", error);
    return Response.json({ fout: "Thuis is even niet bij te werken." }, { status: 503, headers });
  }
}
