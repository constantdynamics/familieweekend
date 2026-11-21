import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";
import { getSettings } from "@/lib/server/settings";

/**
 * The version of this device's environment, plus where the Realtime channel
 * lives. Phones ask this on focus and, without Realtime, every few seconds.
 *
 * VALK_POLL_CALM_MS (server, runtime) overrides how often phones ask when
 * nothing runs live. Only the e2e tests set it: there is no Realtime there,
 * and a second phone should follow within seconds.
 */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const [live, settings] = await Promise.all([readLiveState(ctx.env), getSettings()]);
  const calm = Number(process.env.VALK_POLL_CALM_MS) || null;
  return Response.json(
    { env: ctx.env, v: live.version, live: live.mode !== "rust", realtime: settings.realtime, ...(calm ? { calm } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
