"use client";

import Link from "next/link";
import { IconPijlVerder, IconPrikbord, IconSlot, IconVastgezet } from "@/components/ui/icons";
import { IconMegafoon } from "@/components/ui/icons-prikbord";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { aantal, relativeTime, type ChannelList, type ChannelSummary } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { ChannelChips } from "./Board";
import { Notice } from "./Notice";
import { useBoardFeed, useNow } from "./useBoardFeed";

function samen(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
}

function ChannelCard({ channel, now }: { channel: ChannelSummary; now: number }) {
  const Icon = channel.staffOnly ? IconMegafoon : channel.readOnly ? IconSlot : channel.pinned ? IconVastgezet : IconPrikbord;
  return (
    <Link
      href={`/prikbord?kanaal=${channel.id}`}
      className="op-licht flex items-start gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd text-studio">
        <Icon size={22} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="m-0 text-[18px] leading-tight font-extrabold">{bijElkaar(channel.title, 0)}</h2>
        {channel.description ? (
          <span className="text-label leading-[1.4]">{bijElkaar(channel.description)}</span>
        ) : null}
        <ChannelChips channel={channel} className="mt-0.5" />
        <span className="mt-0.5 text-klein font-bold">
          {channel.posts === 0
            ? "Nog geen berichten"
            : [aantal(channel.posts, "bericht", "berichten"), channel.replies > 0 ? aantal(channel.replies, "reactie", "reacties") : null]
                .filter(Boolean)
                .join(" · ")}
        </span>
        {channel.lastAt ? (
          <span className="text-klein">
            Laatst: {channel.lastAuthor ? `${bijElkaar(channel.lastAuthor)}, ` : ""}
            {relativeTime(channel.lastAt, now)}
          </span>
        ) : null}
      </div>
      <IconPijlVerder size={20} className="mt-3 flex-none" />
    </Link>
  );
}

/** The channels of the prikbord, pinned first, kept up to date. */
export function ChannelOverview({ initial, renderedAt }: { initial: ChannelList; renderedAt: number }) {
  const { data } = useBoardFeed("/api/prikbord", initial);
  const now = useNow(renderedAt);
  return (
    <>
      {data.reason === null && data.names.length > 0 ? (
        <p className="m-0 mt-3 text-[15px] leading-[1.45] text-zand">
          Je doet mee als <strong className="font-extrabold text-beeldbuis">{bijElkaar(samen(data.names))}</strong>.
        </p>
      ) : null}
      <Notice notice={data.reason ?? (data.boardOpen ? null : "dicht")} terug="/prikbord" />

      {data.channels.length === 0 ? (
        <div className="mt-5">
          <LegeStaat icon={<IconPrikbord size={34} />} titel="Nog geen kanalen">
            <p className="m-0">{bijElkaar("De organisatie zet de kanalen klaar. Kijk straks nog eens.")}</p>
          </LegeStaat>
        </div>
      ) : (
        <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
          {data.channels.map((channel) => (
            <li key={channel.id} className="flex flex-col">
              <ChannelCard channel={channel} now={now} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
