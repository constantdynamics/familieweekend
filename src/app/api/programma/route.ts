import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { programView } from "@/lib/server/program";
import { getSettings } from "@/lib/server/settings";

/** The program, for the Programma tab to stay live when the admin changes it. */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
    return Response.json(await programView(ctx, settings), { headers });
  } catch (error) {
    logError("api.programma", error);
    return Response.json({ fout: "Het programma is even niet bij te werken." }, { status: 503, headers });
  }
}
