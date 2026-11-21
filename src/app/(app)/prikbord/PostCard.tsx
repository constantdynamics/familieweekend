"use client";

import { useId, useState } from "react";
import { IconMenuPunten, IconOog, IconOogDicht, IconPotlood, IconPrullenbak, IconReactie } from "@/components/ui/icons";
import { IconMegafoon } from "@/components/ui/icons-prikbord";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { STAFF_AS, STAFF_AUTHOR, aantal, initials, relativeTime, type FeedPost } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatFull } from "@/lib/shared/time";
import { bewerkBericht, plaatsBericht, verbergBericht, verwijderBericht, type BoardActionResult } from "./actions";
import { useBoard } from "./board-context";
import { Composer } from "./Composer";
import { PhotoGrid } from "./PhotoGrid";
import { PostText } from "./PostText";
import { Reactions } from "./Reactions";

const GEEN_VERBINDING = "Geen verbinding. Probeer het opnieuw als je weer internet hebt.";

export function Avatar({ name, staff, small = false }: { name: string; staff: boolean; small?: boolean }) {
  const size = small ? "h-8 w-8 text-[13px]" : "h-10 w-10 text-[15px]";
  return (
    <span
      aria-hidden="true"
      className={`flex ${size} flex-none items-center justify-center rounded-pil font-extrabold text-studio ${
        staff ? "bg-oranje" : "bg-mosterd"
      }`}
    >
      {staff ? <IconMegafoon size={small ? 17 : 21} /> : initials(name)}
    </span>
  );
}

/** "5 minuten geleden · bewerkt", the time in full when you hover it. */
export function PostMeta({ post, now }: { post: FeedPost; now: number }) {
  return (
    <p className="m-0 text-klein">
      <time dateTime={post.createdAt} title={formatFull(new Date(post.createdAt))}>
        {relativeTime(post.createdAt, now)}
      </time>
      {post.editedAt ? (
        <span>
          {" · "}
          {(post.editedByStaff ? "bewerkt door de spelleiding" : "bewerkt").replaceAll(" ", " ")}
        </span>
      ) : null}
    </p>
  );
}

/**
 * One post on the board, or a reply underneath one. Your own posts (and for
 * the admin every post) get a menu to edit, hide or delete. A top-level post
 * shows its replies folded up ("3 reacties") with a field to reply.
 */
export function PostCard({ post, reply = false }: { post: FeedPost; reply?: boolean }) {
  const board = useBoard();
  const { viewer } = board;
  const ids = useId();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = viewer.isAdmin || (post.mine && viewer.canEditOwn);
  const canDelete = viewer.isAdmin || post.mine;
  const canHide = viewer.isAdmin;
  const open = !reply && board.isOpen(post.id);
  const canReply = !reply && board.author !== null;
  // Without anything to show, the post has no footer at all (no empty strip).
  const hasReactions = post.hearts + post.thumbs > 0 || board.reactor !== null;
  const hasReplyButton = !reply && (post.replyCount > 0 || canReply);
  const titleId = `${ids}-wie`;
  const menuId = `${ids}-menu`;
  const repliesId = `${ids}-reacties`;
  const Kop = reply ? "h4" : "h3";
  // Photos added while editing belong to the author on this phone, or to the spelleiding.
  const editAuthor = post.mine && viewer.names[0] ? viewer.names[0] : { id: STAFF_AS, name: STAFF_AUTHOR };

  async function act(work: () => Promise<BoardActionResult>, message: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if ("fout" in result) {
        setError(result.fout);
        return;
      }
      setMenu(false);
      setConfirm(false);
      await board.changed(message);
    } catch {
      setError(GEEN_VERBINDING);
    } finally {
      setBusy(false);
    }
  }

  const confirmText =
    !reply && post.replyCount > 0
      ? `Weet je het zeker? ${post.replyCount === 1 ? "De reactie eronder gaat" : `De ${post.replyCount} reacties eronder gaan`} ook weg.`
      : "Weet je het zeker? Dit kun je niet terugdraaien.";

  return (
    <article
      aria-labelledby={titleId}
      className={
        reply
          ? "flex flex-col rounded-tegel bg-papier p-3"
          : `op-licht flex flex-col rounded-kaart bg-beeldbuis p-4 text-studio shadow-kaart ${post.hidden ? "outline-[3px] outline-dashed outline-roest" : ""}`
      }
    >
      <header className="flex items-start gap-3">
        <Avatar name={post.author} staff={post.staff} small={reply} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Kop id={titleId} className={`m-0 leading-tight font-extrabold ${reply ? "text-[15px]" : "text-[17px]"}`}>
            {bijElkaar(post.author)}
          </Kop>
          <PostMeta post={post} now={board.now} />
        </div>
        {post.hidden ? (
          <span className="rounded-pil bg-roest px-2.5 py-0.5 text-klein font-bold text-beeldbuis">Verborgen</span>
        ) : null}
        {canEdit || canDelete || canHide ? (
          <button
            type="button"
            aria-expanded={menu}
            aria-controls={menuId}
            onClick={() => {
              setMenu(!menu);
              setConfirm(false);
            }}
            className="-mt-1.5 -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-pil hover:bg-papier"
          >
            <IconMenuPunten size={22} />
            <span className="sr-only">Meer voor dit bericht</span>
          </button>
        ) : null}
      </header>

      <div id={menuId} hidden={!menu} className="mt-3">
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Knop
              variant="secundair-licht"
              size="klein"
              onClick={() => {
                setEditing(true);
                setMenu(false);
              }}
            >
              <IconPotlood size={18} />
              Bewerk
            </Knop>
          ) : null}
          {canHide ? (
            <Knop
              variant="secundair-licht"
              size="klein"
              disabled={busy}
              onClick={() =>
                act(
                  () => verbergBericht({ id: post.id, verborgen: !post.hidden }),
                  post.hidden ? "Bericht is weer zichtbaar" : "Bericht verborgen",
                )
              }
            >
              {post.hidden ? <IconOog size={18} /> : <IconOogDicht size={18} />}
              {post.hidden ? "Laat weer zien" : "Verberg"}
            </Knop>
          ) : null}
          {canDelete ? (
            <Knop variant="secundair-licht" size="klein" disabled={busy} onClick={() => setConfirm(true)}>
              <IconPrullenbak size={18} />
              Verwijder
            </Knop>
          ) : null}
        </div>
        {confirm ? (
          <div className="mt-3 flex flex-col gap-2">
            <Melding tone="fout">{bijElkaar(confirmText)}</Melding>
            <div className="flex flex-wrap gap-2">
              <Knop size="klein" disabled={busy} onClick={() => act(() => verwijderBericht({ id: post.id }), "Bericht verwijderd")}>
                Ja, verwijder
              </Knop>
              <Knop variant="secundair-licht" size="klein" onClick={() => setConfirm(false)}>
                Nee, laat staan
              </Knop>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Melding tone="fout">{bijElkaar(error)}</Melding>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3">
          <Composer
            mode="bewerk"
            author={editAuthor}
            label={post.mine ? "Bewerk je bericht" : "Bewerk het bericht"}
            initialText={post.body}
            initialPhotos={post.photos}
            onSubmit={({ tekst, fotos }) => bewerkBericht({ id: post.id, tekst, fotos })}
            onDone={async () => {
              setEditing(false);
              await board.changed("Bericht bewaard");
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <PostText body={post.body} className="mt-2.5" />
          <PhotoGrid photos={post.photos} author={post.author} className="mt-3" />
        </>
      )}

      {reply ? (
        hasReactions ? (
          <div className="mt-2">
            <Reactions post={post} />
          </div>
        ) : null
      ) : !hasReactions && !hasReplyButton ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-papier-streep pt-3">
          <Reactions post={post} />
          {hasReplyButton ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={repliesId}
              onClick={() => board.setOpen(post.id, !open)}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-pil px-2 text-[15px] font-extrabold hover:underline hover:underline-offset-4"
            >
              <IconReactie size={20} />
              {post.replyCount > 0 ? aantal(post.replyCount, "reactie", "reacties") : "Reageer"}
            </button>
          ) : null}
        </div>
      )}

      {!reply ? (
        <div id={repliesId} hidden={!open} className="mt-3">
          {post.replies.length > 0 ? (
            <ol className="m-0 flex list-none flex-col gap-2.5 border-l-[3px] border-zand p-0 pl-3">
              {post.replies.map((r) => (
                <li key={r.id}>
                  <PostCard post={r} reply />
                </li>
              ))}
            </ol>
          ) : null}
          {canReply && open && board.author ? (
            <div className={post.replies.length > 0 ? "mt-3" : undefined}>
              <Composer
                mode="reactie"
                author={board.author}
                authors={viewer.authors}
                onSubmit={({ tekst, fotos }) =>
                  plaatsBericht({ kanaal: board.channel.id, ouder: post.id, tekst, fotos, als: board.author!.id })
                }
                onDone={() => board.changed("Reactie geplaatst")}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
