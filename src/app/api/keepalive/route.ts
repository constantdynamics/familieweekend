import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { db } from "@/lib/server/db";
import { deleteOrphanUploads } from "@/lib/server/uploads";
import { logError } from "@/lib/server/log";
import { SETTINGS_TAG } from "@/lib/server/settings";

/**
 * Daily keepalive (Vercel Cron, with a GitHub Actions backup): one small
 * write so the free Supabase project is never paused, plus housekeeping of
 * old login attempts. It also refreshes the cached settings, so a change made
 * directly in the database (not via beheer) shows up within a day.
 * Protected with CRON_SECRET.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  await connection();
  if (!authorised(request)) {
    return Response.json({ fout: "Niet toegestaan" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const source = request.headers.get("user-agent")?.includes("vercel-cron") ? "vercel-cron" : "extern";
  try {
    const [row] = await db()<{ beats: string; last_seen_at: Date }[]>`
      update valk.heartbeat
      set last_seen_at = now(), source = ${source}, beats = beats + 1
      where id = 1
      returning beats, last_seen_at
    `;
    await db()`delete from valk.login_attempts where created_at < now() - interval '7 days'`;
    // Photos that were uploaded but never used.
    await deleteOrphanUploads();
    revalidateTag(SETTINGS_TAG, { expire: 0 });
    return Response.json(
      { ok: true, beats: Number(row?.beats ?? 0), at: row?.last_seen_at?.toISOString() ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("keepalive", error);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
