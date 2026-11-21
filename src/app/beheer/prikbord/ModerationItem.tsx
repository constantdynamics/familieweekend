"use client";

import Link from "next/link";
import { useState } from "react";
import { IconOog, IconOogDicht, IconPotlood, IconPrullenbak } from "@/components/ui/icons";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { STAFF_AS, STAFF_AUTHOR, aantal, type FeedPost } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { Composer } from "../../(app)/prikbord/Composer";
import { PhotoGrid } from "../../(app)/prikbord/PhotoGrid";
import { Avatar, PostMeta } from "../../(app)/prikbord/PostCard";
import { PostText } from "../../(app)/prikbord/PostText";
import { useNow } from "../../(app)/prikbord/useBoardFeed";
import { bewerkBerichtBeheer, verbergBerichtBeheer, verwijderBerichtBeheer, type BeheerResult } from "./actions";

export type ModerationView = FeedPost & { channelId: string; channelTitle: string };

/** A post in the admin list: hide or show it, edit it, or delete it (after a check). */
export function ModerationItem({
  post,
  renderedAt,
  ownName,
}: {
  post: ModerationView;
  renderedAt: number;
  /** A name on this phone, for photos added to an own post. */
  ownName: { id: string; name: string } | null;
}) {
  const now = useNow(renderedAt);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(work: () => Promise<BeheerResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if ("fout" in result) setError(result.fout);
      else setConfirm(false);
    } catch {
      setError("Geen verbinding. Probeer het opnieuw als je weer internet hebt.");
    } finally {
      setBusy(false);
    }
  }

  const counts = [
    post.hearts > 0 ? aantal(post.hearts, "hartje", "hartjes") : null,
    post.thumbs > 0 ? aantal(post.thumbs, "duimpje", "duimpjes") : null,
    post.replyCount > 0 ? aantal(post.replyCount, "reactie", "reacties") : null,
  ].filter(Boolean);
  const editAuthor = post.mine && ownName ? ownName : { id: STAFF_AS, name: STAFF_AUTHOR };

  return (
    <li
      className={`op-licht flex flex-col gap-2.5 rounded-kaart bg-beeldbuis p-4 text-studio shadow-kaart ${
        post.hidden ? "outline-[3px] outline-dashed outline-roest" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-klein font-bold">
        <Link href={`/prikbord?kanaal=${post.channelId}`} className="inline-flex min-h-11 items-center no-underline">
          <span className="rounded-pil bg-studio px-2.5 py-1 text-beeldbuis hover:text-mosterd">{bijElkaar(post.channelTitle)}</span>
        </Link>
        {post.parentId ? <span>{bijElkaar("Reactie op een bericht")}</span> : null}
        {post.hidden ? <span className="rounded-pil bg-roest px-2.5 py-0.5 text-beeldbuis">Verborgen</span> : null}
      </div>
      <div className="flex items-start gap-3">
        <Avatar name={post.author} staff={post.staff} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 text-[17px] leading-tight font-extrabold">{bijElkaar(post.author)}</h3>
          <PostMeta post={post} now={now} />
        </div>
      </div>

      {editing ? (
        <Composer
          mode="bewerk"
          author={editAuthor}
          initialText={post.body}
          initialPhotos={post.photos}
          onSubmit={({ tekst, fotos }) => bewerkBerichtBeheer({ id: post.id, tekst, fotos })}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <PostText body={post.body} />
          <PhotoGrid photos={post.photos} author={post.author} className="max-w-[280px]" />
        </>
      )}
      {counts.length > 0 ? <p className="m-0 text-klein">{counts.join(" · ")}</p> : null}

      {error ? <Melding tone="fout">{bijElkaar(error)}</Melding> : null}

      {!editing ? (
        <div className="flex flex-wrap gap-2 border-t-2 border-papier-streep pt-3">
          <Knop
            variant="secundair-licht"
            size="klein"
            disabled={busy}
            onClick={() => act(() => verbergBerichtBeheer({ id: post.id, verborgen: !post.hidden }))}
          >
            {post.hidden ? <IconOog size={18} /> : <IconOogDicht size={18} />}
            {post.hidden ? "Laat weer zien" : "Verberg"}
          </Knop>
          <Knop variant="secundair-licht" size="klein" disabled={busy} onClick={() => setEditing(true)}>
            <IconPotlood size={18} />
            Bewerk
          </Knop>
          <Knop variant="secundair-licht" size="klein" disabled={busy} onClick={() => setConfirm(true)}>
            <IconPrullenbak size={18} />
            Verwijder
          </Knop>
        </div>
      ) : null}
      {confirm ? (
        <div className="flex flex-col gap-2">
          <Melding tone="fout">
            {bijElkaar(
              !post.parentId && post.replyCount > 0
                ? `Weet je het zeker? Ook ${post.replyCount === 1 ? "de reactie eronder gaat" : `de ${post.replyCount} reacties eronder gaan`} weg. Verbergen kun je terugdraaien, verwijderen niet.`
                : "Weet je het zeker? Verbergen kun je terugdraaien, verwijderen niet.",
            )}
          </Melding>
          <div className="flex flex-wrap gap-2">
            <Knop size="klein" disabled={busy} onClick={() => act(() => verwijderBerichtBeheer({ id: post.id }))}>
              Ja, verwijder
            </Knop>
            <Knop variant="secundair-licht" size="klein" onClick={() => setConfirm(false)}>
              Nee, laat staan
            </Knop>
          </div>
        </div>
      ) : null}
    </li>
  );
}
