import { connection } from "next/server";
import { ceremonyAction, ceremonyViewFor, type CeremonyAction } from "@/lib/server/ceremony";
import { getRequestContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";

const headers = { "Cache-Control": "no-store" };

/** The ceremony step for every phone: only what has been revealed so far. */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const settings = await getSettings();
  if (!settings.fase2Live && !ctx.isAdmin) {
    return Response.json({ fout: "De prijsuitreiking is nog niet open." }, { status: 404, headers });
  }
  return Response.json(await ceremonyViewFor(ctx.env, ctx.isAdmin && !ctx.viewAs), { headers });
}

const ACTIONS: readonly CeremonyAction[] = ["start", "volgende", "terug", "stop"];

/** The admin's taps on the ceremony screen. */
export async function POST(request: Request) {
  await connection();
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ fout: "Stuur dit als JSON." }, { status: 415, headers });
  }
  const ctx = await getRequestContext();
  if (!ctx.isAdmin || !ctx.staff || ctx.viewAs) {
    return Response.json({ fout: "Alleen de beheerder bedient de prijsuitreiking." }, { status: 403, headers });
  }
  let body: { actie?: unknown; stap?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ fout: "Dit kwam niet goed aan. Probeer het nog eens." }, { status: 400, headers });
  }
  const action = ACTIONS.find((candidate) => candidate === body.actie);
  if (!action) return Response.json({ fout: "Onbekende stap." }, { status: 400, headers });
  const expected = typeof body.stap === "number" && Number.isInteger(body.stap) ? body.stap : null;
  try {
    const outcome = await ceremonyAction(ctx.env, action, { id: ctx.staff.staffId, name: ctx.staff.name, role: ctx.staff.role }, expected);
    if (outcome.ok) await ring(ctx.env);
    return Response.json(outcome, { status: outcome.ok ? 200 : outcome.conflict ? 409 : 422, headers });
  } catch (error) {
    logError("ceremonie.stap", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. Tik nog een keer." }, { status: 500, headers });
  }
}
