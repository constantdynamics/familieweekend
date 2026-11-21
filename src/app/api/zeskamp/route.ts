import { connection } from "next/server";
import { canActAsCaptain, getRequestContext } from "@/lib/server/context";
import { seesEverything } from "@/lib/server/scoreboard";
import { getSettings } from "@/lib/server/settings";
import { zeskampViewFor } from "@/lib/server/zeskamp";

/**
 * The zeskamp for the family: the games, their status and the jokers that
 * are fixed. Places and points only while the lock is open (SPEC §5.3).
 */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const settings = await getSettings();
  if (!settings.fase2Live && !ctx.isAdmin) {
    return Response.json({ fout: "De zeskamp is nog niet open." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const view = await zeskampViewFor(ctx.env, {
    admin: await seesEverything(ctx),
    ownTeamId: ctx.ownTeamId,
    captain: canActAsCaptain(ctx),
  });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
