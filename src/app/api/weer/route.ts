import { connection } from "next/server";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";
import { getWeatherReport } from "@/lib/server/weather";

/**
 * The weather for the weekend (SPEC §4.10), the same for everyone. The
 * server asks Open-Meteo at most every 30 minutes; see lib/server/weather.
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const report = await getWeatherReport(await getSettings());
    return Response.json(report, { headers });
  } catch (error) {
    logError("api.weer", error);
    return Response.json({ fout: "Het weer is even niet op te halen." }, { status: 503, headers });
  }
}
