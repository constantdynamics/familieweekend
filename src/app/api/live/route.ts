import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { readLiveState } from "@/lib/server/live";

/** Public part of the live state: what is happening right now. Nothing secret. */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const live = await readLiveState(ctx.env);
  return Response.json(
    { env: ctx.env, mode: live.mode, phase: live.phase, lockClosed: live.lockClosed, v: live.version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
