import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";
import { teamsView } from "@/lib/server/team-overview";

/** The teams with members, captain and jokers, for the team screen to stay live. */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
    return Response.json(await teamsView(ctx, settings), { headers });
  } catch (error) {
    logError("api.teams", error);
    return Response.json({ fout: "De teams zijn even niet bij te werken." }, { status: 503, headers });
  }
}
