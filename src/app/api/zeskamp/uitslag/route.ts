import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { submitResults, type SubmitInput } from "@/lib/server/zeskamp";

const headers = { "Cache-Control": "no-store" };

/**
 * The result of a game from the spelleider screen (SPEC §4.9). Phones send
 * it from their offline queue, possibly more than once: the client id makes
 * it count once. Who entered it is recorded.
 */
export async function POST(request: Request) {
  await connection();
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ fout: "Stuur dit als JSON." }, { status: 415, headers });
  }
  const ctx = await getRequestContext();
  if (!ctx.staff) return Response.json({ fout: "Log eerst in als spelleider." }, { status: 401, headers });
  let body: Partial<SubmitInput> & { env?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ fout: "Deze uitslag kwam niet goed aan. Probeer het nog eens." }, { status: 400, headers });
  }
  if (body.env !== undefined && body.env !== ctx.env) {
    return Response.json(
      { status: "conflict", fout: "Deze uitslag hoort bij de andere omgeving (proef of echt). Hij is niet verstuurd." },
      { status: 409, headers },
    );
  }
  try {
    const outcome = await submitResults(
      ctx.env,
      {
        clientId: String(body.clientId ?? ""),
        eventId: String(body.eventId ?? ""),
        values: Array.isArray(body.values)
          ? body.values.map((entry) => ({ teamId: String(entry?.teamId ?? ""), value: Number(entry?.value) }))
          : [],
      },
      { id: ctx.staff.staffId, name: ctx.staff.name, role: ctx.staff.role },
    );
    if (outcome.status === "ontvangen") await ring(ctx.env);
    const code = { ontvangen: 200, "al-ontvangen": 200, conflict: 409, ongeldig: 422, onbekend: 404 }[outcome.status];
    return Response.json(outcome, { status: code, headers });
  } catch (error) {
    logError("zeskamp.uitslag", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. De uitslag blijft bewaard en gaat zo opnieuw." }, { status: 500, headers });
  }
}
