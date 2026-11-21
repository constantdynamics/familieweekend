import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { startGame } from "@/lib/server/zeskamp";

const headers = { "Cache-Control": "no-store" };

/**
 * A spelleider starts a game (status "bezig"). The first game that starts
 * closes the lock. Sent from the offline queue too, so starting twice is fine.
 */
export async function POST(request: Request) {
  await connection();
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ fout: "Stuur dit als JSON." }, { status: 415, headers });
  }
  const ctx = await getRequestContext();
  if (!ctx.staff) return Response.json({ fout: "Log eerst in als spelleider." }, { status: 401, headers });
  let body: { eventId?: unknown; env?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ fout: "Dit kwam niet goed aan. Probeer het nog eens." }, { status: 400, headers });
  }
  if (body.env !== undefined && body.env !== ctx.env) {
    return Response.json({ fout: "Dit spel hoort bij de andere omgeving (proef of echt)." }, { status: 409, headers });
  }
  try {
    const status = await startGame(ctx.env, String(body.eventId ?? ""), {
      id: ctx.staff.staffId,
      name: ctx.staff.name,
      role: ctx.staff.role,
    });
    if (status === "onbekend") return Response.json({ status, fout: "Dit spel bestaat niet meer." }, { status: 404, headers });
    if (status === "gestart") await ring(ctx.env);
    return Response.json({ status }, { headers });
  } catch (error) {
    logError("zeskamp.start", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. Probeer het zo opnieuw." }, { status: 500, headers });
  }
}
