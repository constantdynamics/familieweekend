import { connection } from "next/server";
import { boardReleased, boardViewer, channelList } from "@/lib/server/board";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";

const NO_STORE = { "Cache-Control": "no-store" };

/** The channels with their counts and last activity (hidden posts only count for the admin). */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  const settings = await getSettings();
  if (!boardReleased(ctx, settings)) return Response.json({ fout: "Het prikbord komt eraan." }, { status: 404, headers: NO_STORE });
  try {
    return Response.json(await channelList(boardViewer(ctx, settings)), { headers: NO_STORE });
  } catch (error) {
    logError("prikbord.kanalen", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant." }, { status: 500, headers: NO_STORE });
  }
}
