import { connection, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { seesEverything } from "@/lib/server/scoreboard";
import { staffGameView } from "@/lib/server/zeskamp";

/** One game for the spelleider screen. Spelleiders and the admin only. */
export async function GET(_request: NextRequest, context: RouteContext<"/api/zeskamp/[id]">) {
  await connection();
  const ctx = await getRequestContext();
  if (!ctx.staff) return Response.json({ fout: "Log eerst in als spelleider." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const view = await staffGameView(ctx.env, id, { admin: await seesEverything(ctx), name: ctx.staff.name });
  if (!view) return Response.json({ fout: "Dit spel bestaat niet meer." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
