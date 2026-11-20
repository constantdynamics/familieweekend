import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { intermezzoView } from "@/lib/server/intermezzo";

/** The intermezzo for this phone: the duel, and whether one of its names must choose. */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const view = await intermezzoView(
    ctx.env,
    ctx.names.map((n) => n.id),
  );
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
