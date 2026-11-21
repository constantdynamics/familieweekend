"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useState } from "react";
import { IconPijlTerug, IconPrikbord, IconSlot, IconVastgezet } from "@/components/ui/icons";
import { IconKlok, IconMegafoon, IconVlam } from "@/components/ui/icons-prikbord";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { LegeStaat } from "@/components/ui/LegeStaat";
import {
  BOARD,
  aantal,
  applyReaction,
  keepPhotoUrls,
  type BoardSort,
  type ChannelFeed,
  type FeedChannel,
  type ReactionKind,
} from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { plaatsBericht, reageer } from "./actions";
import { BoardContext, type BoardContextValue } from "./board-context";
import { Composer } from "./Composer";
import { Notice } from "./Notice";
import { PostCard } from "./PostCard";
import { useBoardFeed, useNow } from "./useBoardFeed";

const GEEN_VERBINDING = "Geen verbinding. Probeer het opnieuw als je weer internet hebt.";

/** Fresh data, but the photo links the phone already has (no second download). */
function mergeFeed(next: ChannelFeed, previous: ChannelFeed): ChannelFeed {
  return { ...next, posts: keepPhotoUrls(next.posts, previous.posts, Date.now() / 1000) };
}

/** Small labels under the title: pinned, of the spelleiding, read only. */
export function ChannelChips({ channel, className }: { channel: FeedChannel; className?: string }) {
  const chips = [
    channel.pinned ? { key: "vast", Icon: IconVastgezet, text: "Vastgezet", style: "bg-mosterd text-studio" } : null,
    channel.staffOnly
      ? { key: "spelleiding", Icon: IconMegafoon, text: "Van de spelleiding", style: "bg-oranje text-studio" }
      : null,
    channel.readOnly ? { key: "lezen", Icon: IconSlot, text: "Alleen lezen", style: "bg-zand text-studio" } : null,
  ].filter((chip) => chip !== null);
  if (chips.length === 0) return null;
  return (
    <span className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {chips.map(({ key, Icon, text, style }) => (
        <span key={key} className={`inline-flex items-center gap-1 rounded-pil px-2.5 py-0.5 text-klein font-bold ${style}`}>
          <Icon size={15} />
          {bijElkaar(text)}
        </span>
      ))}
    </span>
  );
}

/**
 * A channel of the prikbord: the composer, the posts (newest or most
 * popular first) with their replies, hearts and thumbs. Stays live: the
 * phone fetches the channel again when the board changed (see useBoardFeed).
 */
export function Board({ initial, renderedAt }: { initial: ChannelFeed; renderedAt: number }) {
  const [sort, setSort] = useState<BoardSort>(initial.sort);
  const [limit, setLimit] = useState(initial.limit);
  const url = `/api/prikbord/${initial.channel.id}?sort=${sort}&aantal=${limit}`;
  const { data: feed, failed, load } = useBoardFeed(url, initial, mergeFeed);
  const now = useNow(renderedAt);
  const [authorId, setAuthorId] = useState<string | null>(initial.viewer.authors[0]?.id ?? null);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, addReaction] = useOptimistic(feed.posts, applyReaction);

  const { viewer, channel } = feed;
  const author = viewer.authors.find((a) => a.id === authorId) ?? viewer.authors[0] ?? null;
  const reactor = viewer.canReact ? (viewer.names.find((n) => n.id === author?.id) ?? viewer.names[0] ?? null) : null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const changed = useCallback(
    async (message: string) => {
      await load();
      setToast({ text: message, at: Date.now() });
    },
    [load],
  );

  const react = useCallback(
    (postId: string, kind: ReactionKind, on: boolean) => {
      if (!reactor) return;
      setError(null);
      startTransition(async () => {
        addReaction({ postId, kind, by: reactor.id, on });
        try {
          const result = await reageer({ id: postId, soort: kind, als: reactor.id, aan: on });
          if ("fout" in result) setError(result.fout);
        } catch {
          setError(GEEN_VERBINDING);
        }
        await load();
      });
    },
    [reactor, addReaction, load],
  );

  const isOpen = useCallback((id: string) => openIds.has(id), [openIds]);
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const context = useMemo<BoardContextValue>(
    () => ({ channel, viewer, now, author, reactor, isOpen, setOpen, react, changed }),
    [channel, viewer, now, author, reactor, isOpen, setOpen, react, changed],
  );

  function chooseSort(next: BoardSort) {
    if (next === sort) return;
    setSort(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "populair") params.set("sort", "populair");
    else params.delete("sort");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  const terug = encodeURIComponent(`/prikbord?kanaal=${channel.id}`);

  return (
    <BoardContext value={context}>
      <div className="flex flex-col pr-10">
        <Link
          href="/prikbord"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
        >
          <IconPijlTerug size={20} />
          Prikbord
        </Link>
        <ChannelChips channel={channel} className="mt-1" />
        <h1 className="m-0 mt-2 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">{bijElkaar(channel.title, 0)}</h1>
        {channel.description ? (
          <p className="m-0 mt-2 text-[15px] leading-[1.45] text-zand">{bijElkaar(channel.description)}</p>
        ) : null}
      </div>

      <Notice notice={viewer.notice} terug={terug} isAdmin={viewer.isAdmin} canReact={viewer.canReact} />

      {author ? (
        <section
          aria-labelledby="nieuw-bericht"
          className="op-licht mt-5 flex flex-col gap-3 rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart"
        >
          <h2 id="nieuw-bericht" className="m-0 text-[19px] leading-tight font-extrabold">
            {channel.staffOnly ? "Nieuwe mededeling" : "Nieuw bericht"}
          </h2>
          <Composer
            mode="nieuw"
            author={author}
            authors={viewer.authors}
            onAuthorChange={setAuthorId}
            onSubmit={({ tekst, fotos }) => plaatsBericht({ kanaal: channel.id, ouder: null, tekst, fotos, als: author.id })}
            onDone={() => changed("Bericht geplaatst")}
          />
        </section>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="m-0 text-[15px] font-bold text-zand">
          {feed.total === 0 ? "Berichten" : aantal(feed.total, "bericht", "berichten")}
        </h2>
        {feed.total > 1 ? (
          <div role="group" aria-label="Volgorde van de berichten" className="flex gap-2">
            {(
              [
                ["nieuw", "Nieuwste", IconKlok],
                ["populair", "Populairste", IconVlam],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => chooseSort(value)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-pil px-3.5 text-[15px] font-bold ${
                  sort === value ? "bg-mosterd text-studio" : "border-2 border-studio-rand text-zand hover:text-beeldbuis"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Melding tone="fout">{bijElkaar(error)}</Melding>
        </div>
      ) : null}
      {failed ? (
        <p role="status" className="m-0 mt-3 text-label text-zand">
          {bijElkaar("Bijwerken lukt even niet. Je ziet de laatste stand.")}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <div className="mt-3">
          <LegeStaat icon={<IconPrikbord size={34} />} titel="Nog niks geprikt">
            <p className="m-0">
              {bijElkaar(
                author ? "Wees de eerste: schrijf hierboven een bericht." : "Zodra er iets geplaatst wordt, staat het hier.",
              )}
            </p>
          </LegeStaat>
        </div>
      ) : (
        <ol className="m-0 mt-3 flex list-none flex-col gap-4 p-0">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ol>
      )}

      {feed.total > feed.posts.length ? (
        <Knop variant="secundair" className="mt-5 self-center" onClick={() => setLimit((n) => n + BOARD.pageSize)}>
          Toon meer berichten
        </Knop>
      ) : null}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {toast ? (
          <p
            key={toast.at}
            className="m-0 rounded-pil bg-beeldbuis px-5 py-2.5 text-[15px] font-extrabold text-studio shadow-tegel"
          >
            {toast.text}
          </p>
        ) : null}
      </div>
    </BoardContext>
  );
}
