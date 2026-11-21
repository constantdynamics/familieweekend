import { connection } from "next/server";
import { boardVersion } from "@/lib/server/board";

/**
 * The board's own version: one tiny row. Phones ask it at every ring and
 * only fetch a channel again when the board really changed.
 */
export async function GET() {
  await connection();
  return Response.json({ v: await boardVersion() }, { headers: { "Cache-Control": "no-store" } });
}
