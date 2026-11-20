import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import { getSettings } from "@/lib/server/settings";

/**
 * The version of this device's environment, plus where the Realtime channel
 * lives. Phones ask this on focus and, without Realtime, every few seconds.
 */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const [live, settings] = await Promise.all([readLiveState(ctx.env), getSettings()]);
  return Response.json(
    { env: ctx.env, v: live.version, live: live.mode !== "rust", realtime: settings.realtime },
    { headers: { "Cache-Control": "no-store" } },
  );
}
