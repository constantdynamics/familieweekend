import { connection } from "next/server";
import { db } from "@/lib/server/db";
import { logError } from "@/lib/server/log";

/** Public health check: is the app up and can it reach the database? No data. */
export async function GET() {
  await connection();
  const started = performance.now();
  try {
    await db()`select 1`;
    return Response.json(
      { ok: true, database: "ok", ms: Math.round(performance.now() - started) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("health", error);
    return Response.json({ ok: false, database: "onbereikbaar" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
