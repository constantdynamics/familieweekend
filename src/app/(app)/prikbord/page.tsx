import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconPrikbord } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";
import { boardReleased, boardViewer, channelFeed, channelList } from "@/lib/server/board";
import { getRequestContext } from "@/lib/server/context";
import { getSettings } from "@/lib/server/settings";
import { BOARD, parseSort } from "@/lib/shared/board";
import { Board } from "./Board";
import { ChannelOverview } from "./ChannelOverview";

export const metadata: Metadata = { title: "Prikbord" };

/** When the page was rendered; relative times start here until the phone takes over. */
function renderMoment(): number {
  return Date.now();
}

/*
 * The prikbord: the channels, or one channel with ?kanaal=<id>. A query
 * string instead of a path segment keeps the pathname static, so the menu
 * and the live takeover in the layout stay part of the prerendered shell.
 */
export default function PrikbordPage({ searchParams }: PageProps<"/prikbord">) {
  return (
    <Scherm>
      <Suspense fallback={<Laden />}>
        <Inhoud searchParams={searchParams} />
      </Suspense>
    </Scherm>
  );
}

function Laden() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 pr-10">
      <span className="sr-only">Het prikbord laden…</span>
      <div className="h-9 w-44 rounded-tegel bg-studio-licht" />
      <div className="h-5 w-64 max-w-full rounded-pil bg-studio-licht" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-kaart bg-studio-licht" />
      ))}
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/prikbord">["searchParams"] }) {
  const [ctx, settings, params] = await Promise.all([getRequestContext(), getSettings(), searchParams]);
  if (!boardReleased(ctx, settings)) {
    return (
      <>
        <SchermTitel sub="Groeten, herinneringen en sterke verhalen">Prikbord</SchermTitel>
        <div className="mt-4">
          <LegeStaat icon={<IconPrikbord size={34} />} titel="Het prikbord komt eraan">
            <p className="m-0">Hier zet de familie straks berichten en foto&apos;s neer.</p>
          </LegeStaat>
        </div>
      </>
    );
  }
  const viewer = boardViewer(ctx, settings);
  const kanaal = first(params.kanaal);
  if (kanaal) {
    const feed = await channelFeed(kanaal, viewer, { sort: parseSort(first(params.sort)), limit: BOARD.pageSize });
    if (!feed) notFound();
    return <Board key={feed.channel.id} initial={feed} renderedAt={renderMoment()} />;
  }
  const list = await channelList(viewer);
  return (
    <>
      <SchermTitel sub="Groeten, herinneringen en sterke verhalen">Prikbord</SchermTitel>
      <ChannelOverview initial={list} renderedAt={renderMoment()} />
    </>
  );
}
