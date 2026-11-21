import { connection } from "next/server";
import { boardReleased, boardViewer, channelFeed } from "@/lib/server/board";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";
import { parseLimit, parseSort } from "@/lib/shared/board";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * One channel with its posts and replies, for this phone: the family never
 * receives hidden posts, and "mine" and the own hearts follow the names on
 * this phone.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/prikbord/[kanaal]">) {
  await connection();
  const ctx = await getRequestContext();
  const settings = await getSettings();
  if (!boardReleased(ctx, settings)) return Response.json({ fout: "Het prikbord komt eraan." }, { status: 404, headers: NO_STORE });
  const { kanaal } = await params;
  const url = new URL(request.url);
  try {
    const feed = await channelFeed(kanaal, boardViewer(ctx, settings), {
      sort: parseSort(url.searchParams.get("sort")),
      limit: parseLimit(url.searchParams.get("aantal")),
    });
    if (!feed) return Response.json({ fout: "Dit kanaal bestaat niet." }, { status: 404, headers: NO_STORE });
    return Response.json(feed, { headers: NO_STORE });
  } catch (error) {
    logError("prikbord.kanaal", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant." }, { status: 500, headers: NO_STORE });
  }
}
