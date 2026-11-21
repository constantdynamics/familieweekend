import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { adminWantsSurprise, scoreViewFor } from "@/lib/server/scoreboard";
import { getSettings } from "@/lib/server/settings";

/**
 * The scoreboard as this phone may see it (SPEC §5.3): while the lock is
 * closed only the snapshot of the lock and which parts were played; the
 * admin sees everything, or nothing at all when he wants to be surprised.
 */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const settings = await getSettings();
  if (!settings.fase2Live && !ctx.isAdmin) {
    return Response.json({ fout: "Het scorebord is nog niet open." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const admin = ctx.isAdmin && !ctx.viewAs;
  const view = await scoreViewFor(ctx.env, { admin, surprise: admin && (await adminWantsSurprise()) });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
