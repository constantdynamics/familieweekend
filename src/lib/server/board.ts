import "server-only";
import type { Sql, TransactionSql } from "postgres";
import {
  BOARD,
  STAFF_AS,
  STAFF_AUTHOR,
  bodyProblem,
  boardRights,
  cleanBody,
  excerpt,
  floodCheck,
  type BoardSort,
  type ChannelFeed,
  type ChannelList,
  type ChannelSummary,
  type FeedChannel,
  type FeedPhoto,
  type FeedPost,
  type FeedViewer,
  type ReactionKind,
  type Rights,
  type ViewerReason,
} from "@/lib/shared/board";
import { formatTime } from "@/lib/shared/time";
import { logAudit, type Actor } from "./audit";
import type { RequestContext } from "./context";
import { db } from "./db";
import { ring } from "./live";
import type { Settings } from "./settings";
import { isUuid } from "./teams";
import { signedPhotoUrl } from "./uploads";

/**
 * The prikbord (SPEC wish of the owner, docs/PLAN-fase-2-4.md): channels,
 * posts with replies, hearts and thumbs, photos and moderation.
 *
 * The board belongs to the family, not to the test environment: there is no
 * env column, and nobody writes on it from the test environment (it would be
 * a test name on the real board). It stays for next year.
 */

/** Who is looking: worked out from the request context and the settings. */
export type BoardViewer = {
  /** The admin, unless viewing the app through someone else's eyes. */
  admin: Actor | null;
  /** The names on this phone that may write on the board. */
  names: { id: string; name: string }[];
  /** Why this phone cannot write with a name (or null). */
  reason: ViewerReason;
  boardOpen: boolean;
};

export function boardViewer(ctx: RequestContext, settings: Settings): BoardViewer {
  const viewingAs = ctx.viewAs !== null;
  const admin =
    ctx.isAdmin && !viewingAs && ctx.staff ? { id: ctx.staff.staffId, name: ctx.staff.name, role: ctx.staff.role } : null;
  const names = ctx.env === "live" && !viewingAs ? ctx.names.map((n) => ({ id: n.id, name: n.displayName })) : [];
  const reason: ViewerReason = viewingAs ? "bekijk-als" : ctx.env === "test" ? "proef" : names.length === 0 ? "geen-naam" : null;
  return { admin, names, reason, boardOpen: settings.boardOpen };
}

/** The board may be shown: released to the family, or the admin tries it out. */
export function boardReleased(ctx: RequestContext, settings: Settings): boolean {
  return settings.fase2Live || ctx.isAdmin;
}

function rightsFor(channel: { staffOnly: boolean; readOnly: boolean }, viewer: BoardViewer): Rights {
  return boardRights(channel, {
    isAdmin: viewer.admin !== null,
    hasNames: viewer.names.length > 0,
    reason: viewer.reason,
    boardOpen: viewer.boardOpen,
  });
}

/** Everything on the board changed: both environments ring, the board is the same in both. */
async function ringBoard(): Promise<void> {
  await Promise.all([ring("live"), ring("test")]);
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

/** The board's own version (triggers raise it on every change). */
export async function boardVersion(sql: Sql = db()): Promise<number> {
  const [row] = await sql<{ version: string }[]>`select version from valk.board_state where id = 1`;
  return Number(row?.version ?? 0);
}

type ChannelRow = {
  id: string;
  title: string;
  description: string | null;
  sort: number;
  pinned: boolean;
  staff_only: boolean;
  read_only: boolean;
};

function toChannel(row: ChannelRow): FeedChannel {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pinned: row.pinned,
    staffOnly: row.staff_only,
    readOnly: row.read_only,
  };
}

async function readChannel(id: string, sql: Sql | TransactionSql = db()): Promise<FeedChannel | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<ChannelRow[]>`
    select id, title, description, sort, pinned, staff_only, read_only from valk.board_channels where id = ${id}
  `;
  return row ? toChannel(row) : null;
}

/**
 * The channels, pinned first, with the number of posts and the last
 * activity. Hidden posts (and replies under a hidden post) only count for
 * the admin.
 */
export async function channelList(viewer: BoardViewer): Promise<ChannelList> {
  const sql = db();
  const v = await boardVersion(sql);
  const admin = viewer.admin !== null;
  const rows = await sql<
    (ChannelRow & { posts: number; replies: number; last_at: Date | null; last_author: string | null })[]
  >`
    with zichtbaar as (
      select p.id, p.channel_id, p.parent_id, p.created_at, p.participant_id, p.author_name
      from valk.board_posts p
      left join valk.board_posts ouder on ouder.id = p.parent_id
      where ${admin}::boolean or (not p.hidden and coalesce(not ouder.hidden, true))
    )
    select c.id, c.title, c.description, c.sort, c.pinned, c.staff_only, c.read_only,
      (select count(*)::int from zichtbaar z where z.channel_id = c.id and z.parent_id is null) as posts,
      (select count(*)::int from zichtbaar z where z.channel_id = c.id and z.parent_id is not null) as replies,
      laatste.created_at as last_at, laatste.author as last_author
    from valk.board_channels c
    left join lateral (
      select z.created_at, coalesce(nullif(btrim(pa.nickname), ''), pa.name, z.author_name) as author
      from zichtbaar z
      left join valk.participants pa on pa.id = z.participant_id
      where z.channel_id = c.id
      order by z.created_at desc
      limit 1
    ) laatste on true
    order by c.pinned desc, c.sort, lower(c.title)
  `;
  const channels: ChannelSummary[] = rows.map((row) => ({
    ...toChannel(row),
    posts: row.posts,
    replies: row.replies,
    lastAt: row.last_at?.toISOString() ?? null,
    lastAuthor: row.last_author,
  }));
  return { v, channels, names: viewer.names.map((n) => n.name), reason: viewer.reason, boardOpen: viewer.boardOpen };
}

type PostRow = {
  id: string;
  channel_id: string;
  parent_id: string | null;
  participant_id: string | null;
  author: string;
  author_staff: boolean;
  body: string;
  photo_ids: string[];
  hidden: boolean;
  created_at: Date;
  edited_at: Date | null;
  edited_by: string | null;
  reply_count: number;
};

/** Hearts, thumbs, photos and signed links for a set of posts. */
async function decorate(rows: PostRow[], viewer: BoardViewer, sql: Sql): Promise<Map<string, FeedPost>> {
  const ids = rows.map((r) => r.id);
  const myIds = viewer.names.map((n) => n.id);
  const photoIds = [...new Set(rows.flatMap((r) => r.photo_ids))];
  const [reactions, photos] = await Promise.all([
    ids.length === 0
      ? []
      : sql<{ post_id: string; kind: ReactionKind; n: number; mine: string[] }[]>`
          select post_id, kind, count(*)::int as n,
            coalesce(array_agg(participant_id) filter (where participant_id = any(${myIds}::uuid[])), '{}') as mine
          from valk.board_reactions
          where post_id = any(${ids}::uuid[])
          group by post_id, kind
        `,
    photoIds.length === 0
      ? []
      : sql<{ id: string; width: number | null; height: number | null }[]>`
          select id, width, height from valk.uploads where id = any(${photoIds}::uuid[]) and kind = 'bord'
        `,
  ]);
  const photoMeta = new Map<string, FeedPhoto>();
  await Promise.all(
    photos.map(async (p) => {
      photoMeta.set(p.id, { id: p.id, url: await signedPhotoUrl(p.id, BOARD.photoTtlSeconds), width: p.width, height: p.height });
    }),
  );
  const mine = new Set(myIds);
  const out = new Map<string, FeedPost>();
  for (const row of rows) {
    const hearts = reactions.find((r) => r.post_id === row.id && r.kind === "hart");
    const thumbs = reactions.find((r) => r.post_id === row.id && r.kind === "duim");
    out.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      author: row.author,
      staff: row.author_staff,
      body: row.body,
      photos: row.photo_ids.map((id) => photoMeta.get(id)).filter((p): p is FeedPhoto => Boolean(p)),
      createdAt: row.created_at.toISOString(),
      editedAt: row.edited_at?.toISOString() ?? null,
      editedByStaff: row.edited_by === STAFF_AUTHOR && !row.author_staff,
      hidden: row.hidden,
      mine: row.participant_id !== null && mine.has(row.participant_id),
      hearts: hearts?.n ?? 0,
      thumbs: thumbs?.n ?? 0,
      myHearts: hearts?.mine ?? [],
      myThumbs: thumbs?.mine ?? [],
      replies: [],
      replyCount: row.reply_count,
    });
  }
  return out;
}

/**
 * One channel: top-level posts (newest first, or most popular: hearts,
 * thumbs and replies together), each with its replies (oldest first).
 */
export async function channelFeed(
  channelId: string,
  viewer: BoardViewer,
  options: { sort: BoardSort; limit: number },
): Promise<ChannelFeed | null> {
  const sql = db();
  // The version first: a change after this read always shows up as a newer version.
  const v = await boardVersion(sql);
  const channel = await readChannel(channelId, sql);
  if (!channel) return null;
  const admin = viewer.admin !== null;
  const popular = options.sort === "populair";
  const limit = Math.max(1, Math.min(BOARD.maxPageSize, Math.floor(options.limit)));

  const [top, [{ total }]] = await Promise.all([
    sql<PostRow[]>`
      with stats as (
        select p.*,
          (select count(*)::int from valk.board_posts r where r.parent_id = p.id and (${admin}::boolean or not r.hidden)) as reply_count,
          (select count(*)::int from valk.board_reactions x where x.post_id = p.id) as reaction_count
        from valk.board_posts p
        where p.channel_id = ${channel.id} and p.parent_id is null and (${admin}::boolean or not p.hidden)
      )
      select s.id, s.channel_id, s.parent_id, s.participant_id,
        coalesce(nullif(btrim(pa.nickname), ''), pa.name, s.author_name) as author,
        s.author_staff, s.body, s.photo_ids, s.hidden, s.created_at, s.edited_at, s.edited_by, s.reply_count
      from stats s
      left join valk.participants pa on pa.id = s.participant_id
      order by case when ${popular}::boolean then s.reaction_count + s.reply_count else 0 end desc, s.created_at desc
      limit ${limit}
    `,
    sql<{ total: number }[]>`
      select count(*)::int as total from valk.board_posts
      where channel_id = ${channel.id} and parent_id is null and (${admin}::boolean or not hidden)
    `,
  ]);

  const topIds = top.map((p) => p.id);
  const replies =
    topIds.length === 0
      ? []
      : await sql<PostRow[]>`
          select p.id, p.channel_id, p.parent_id, p.participant_id,
            coalesce(nullif(btrim(pa.nickname), ''), pa.name, p.author_name) as author,
            p.author_staff, p.body, p.photo_ids, p.hidden, p.created_at, p.edited_at, p.edited_by, 0 as reply_count
          from valk.board_posts p
          left join valk.participants pa on pa.id = p.participant_id
          where p.parent_id = any(${topIds}::uuid[]) and (${admin}::boolean or not p.hidden)
          order by p.created_at asc
        `;

  const decorated = await decorate([...top, ...replies], viewer, sql);
  const posts = top.map((row) => {
    const post = decorated.get(row.id)!;
    return { ...post, replies: replies.filter((r) => r.parent_id === row.id).map((r) => decorated.get(r.id)!) };
  });

  return { v, channel, posts, total, sort: options.sort, limit, viewer: feedViewer(channel, viewer) };
}

function feedViewer(channel: FeedChannel, viewer: BoardViewer): FeedViewer {
  const rights = rightsFor(channel, viewer);
  const staff = rights.staffPost ? [{ id: STAFF_AS, name: STAFF_AUTHOR }] : [];
  return {
    isAdmin: viewer.admin !== null,
    names: viewer.names,
    authors: [...(rights.post ? viewer.names : []), ...staff],
    canReact: rights.react,
    canEditOwn: rights.editOwn,
    notice: rights.notice,
  };
}

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

export type BoardResult<T extends object = object> = ({ ok: true } & T) | { fout: string };

const NO_LONGER = "Dit bericht bestaat niet meer. Misschien is het net verwijderd.";

/** Why this phone cannot write here, in Dutch. */
function refusal(rights: Rights): string {
  switch (rights.notice) {
    case "geen-naam":
      return "Kies eerst je naam, dan kun je meedoen.";
    case "proef":
      return "In de proef kun je het prikbord alleen bekijken.";
    case "bekijk-als":
      return "Je bekijkt de app als iemand anders. Op het prikbord lees je alleen mee.";
    case "dicht":
      return "Het prikbord is even dicht. Lezen kan wel.";
    case "alleen-lezen":
      return "Dit kanaal is alleen om te lezen.";
    case "spelleiding":
      return "Hier plaatst alleen de spelleiding.";
    default:
      return "Dat mag hier niet.";
  }
}

type PostContext = {
  id: string;
  channel: FeedChannel;
  parentId: string | null;
  participantId: string | null;
  authorName: string;
  authorStaff: boolean;
  body: string;
  photoIds: string[];
  hidden: boolean;
  parentHidden: boolean;
  replyCount: number;
};

async function readPost(id: string, sql: Sql | TransactionSql, lock = false): Promise<PostContext | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<
    (ChannelRow & {
      post_id: string;
      parent_id: string | null;
      participant_id: string | null;
      author: string;
      author_staff: boolean;
      body: string;
      photo_ids: string[];
      hidden: boolean;
      parent_hidden: boolean;
      reply_count: number;
    })[]
  >`
    select p.id as post_id, p.parent_id, p.participant_id,
      coalesce(nullif(btrim(pa.nickname), ''), pa.name, p.author_name) as author,
      p.author_staff, p.body, p.photo_ids, p.hidden, coalesce(ouder.hidden, false) as parent_hidden,
      (select count(*)::int from valk.board_posts r where r.parent_id = p.id) as reply_count,
      c.id, c.title, c.description, c.sort, c.pinned, c.staff_only, c.read_only
    from valk.board_posts p
    join valk.board_channels c on c.id = p.channel_id
    left join valk.board_posts ouder on ouder.id = p.parent_id
    left join valk.participants pa on pa.id = p.participant_id
    where p.id = ${id}
    ${lock ? sql`for update of p` : sql``}
  `;
  if (!row) return null;
  return {
    id: row.post_id,
    channel: toChannel(row),
    parentId: row.parent_id,
    participantId: row.participant_id,
    authorName: row.author,
    authorStaff: row.author_staff,
    body: row.body,
    photoIds: row.photo_ids,
    hidden: row.hidden,
    parentHidden: row.parent_hidden,
    replyCount: row.reply_count,
  };
}

/** The family never acts on hidden posts; for them those do not exist. */
function visibleTo(post: PostContext, viewer: BoardViewer): boolean {
  return viewer.admin !== null || (!post.hidden && !post.parentHidden);
}

function ownPost(post: PostContext, viewer: BoardViewer): boolean {
  return post.participantId !== null && viewer.names.some((n) => n.id === post.participantId);
}

function cleanIds(value: string[]): string[] | null {
  const ids = [...new Set(value)];
  return ids.every(isUuid) ? ids : null;
}

/**
 * New photos for a post: board photos that exist, belong to the person
 * posting (or were uploaded by the spelleiding) and are not part of another
 * post yet.
 */
async function photoProblem(
  ids: string[],
  owner: { participantIds: string[]; staff: boolean },
  exceptPostId: string | null,
  sql: TransactionSql,
): Promise<string | null> {
  if (ids.length === 0) return null;
  const rows = await sql<{ id: string; participant_id: string | null }[]>`
    select id, participant_id from valk.uploads where id = any(${ids}::uuid[]) and kind = 'bord'
  `;
  if (rows.length !== ids.length) return "Een van de foto's is er niet meer. Kies hem opnieuw.";
  const allowed = rows.every((r) =>
    r.participant_id === null ? owner.staff : owner.participantIds.includes(r.participant_id),
  );
  if (!allowed) return "Een van de foto's is niet van jou. Kies hem opnieuw.";
  const [used] = await sql<{ id: string }[]>`
    select id from valk.board_posts
    where photo_ids && ${ids}::uuid[] and (${exceptPostId}::uuid is null or id <> ${exceptPostId}::uuid)
    limit 1
  `;
  return used ? "Een van de foto's hoort al bij een ander bericht." : null;
}

export type NewPost = {
  channelId: string;
  parentId: string | null;
  body: string;
  photoIds: string[];
  /** A participant id of this phone, or STAFF_AS. */
  as: string;
};

/** Place a post or a reply. */
export async function createPost(viewer: BoardViewer, input: NewPost): Promise<BoardResult<{ id: string }>> {
  const body = cleanBody(input.body);
  const photoIds = cleanIds(input.photoIds);
  if (!photoIds) return { fout: "Een van de foto's klopt niet. Kies hem opnieuw." };
  const problem = bodyProblem(body, photoIds.length);
  if (problem) return { fout: problem };

  const sql = db();
  const channel = await readChannel(input.channelId, sql);
  if (!channel) return { fout: "Dit kanaal bestaat niet meer." };
  const rights = rightsFor(channel, viewer);

  const asStaff = input.as === STAFF_AS;
  const name = asStaff ? null : viewer.names.find((n) => n.id === input.as);
  if (asStaff ? !rights.staffPost : !rights.post) return { fout: refusal(rights) };
  if (!asStaff && !name) return { fout: "Kies een naam die bij deze telefoon hoort." };

  const result = await sql.begin(async (tx): Promise<BoardResult<{ id: string }>> => {
    if (input.parentId !== null) {
      const parent = await readPost(input.parentId, tx);
      if (!parent || parent.parentId !== null || parent.channel.id !== channel.id || !visibleTo(parent, viewer)) {
        return { fout: NO_LONGER };
      }
    }
    // One post at a time per author: the flood limit and the double-tap check stay right.
    await tx`select pg_advisory_xact_lock(hashtext(${`bord:${asStaff ? "spelleiding" : name!.id}`}))`;

    const [twice] = await tx<{ id: string }[]>`
      select id from valk.board_posts
      where channel_id = ${channel.id}
        and parent_id is not distinct from ${input.parentId}::uuid
        and ${asStaff ? tx`author_staff and participant_id is null` : tx`participant_id = ${name!.id}`}
        and body = ${body} and photo_ids = ${photoIds}::uuid[]
        and created_at > now() - interval '2 minutes'
      limit 1
    `;
    if (twice) return { ok: true, id: twice.id };

    if (name) {
      const recent = await tx<{ created_at: Date }[]>`
        select created_at from valk.board_posts
        where participant_id = ${name.id}
        order by created_at desc
        limit ${BOARD.floodPosts}
      `;
      const flood = floodCheck(
        recent.map((r) => r.created_at),
        Date.now(),
      );
      if (flood.blocked && flood.retryAt) {
        return {
          fout: `Rustig aan! Je hebt net al ${BOARD.floodPosts} berichten geplaatst. Om ${formatTime(flood.retryAt)} kan het weer.`,
        };
      }
    }

    const photoError = await photoProblem(
      photoIds,
      { participantIds: viewer.names.map((n) => n.id), staff: asStaff },
      null,
      tx,
    );
    if (photoError) return { fout: photoError };

    const [row] = await tx<{ id: string }[]>`
      insert into valk.board_posts (channel_id, parent_id, participant_id, author_name, author_staff, body, photo_ids)
      values (
        ${channel.id}, ${input.parentId}::uuid, ${name ? name.id : null}::uuid,
        ${name ? name.name : STAFF_AUTHOR}, ${asStaff}::boolean, ${body}, ${photoIds}::uuid[]
      )
      returning id
    `;
    if (asStaff && viewer.admin) {
      await logAudit(
        viewer.admin,
        {
          action: input.parentId ? "bord.spelleiding.reactie" : "bord.spelleiding.bericht",
          entity: "bericht",
          entityId: row.id,
          newValue: { kanaal: channel.title, tekst: excerpt(body) },
        },
        tx,
        "live",
      );
    }
    return { ok: true, id: row.id };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

/** Edit the text (and photos) of a post: your own, or any post for the admin. */
export async function editPost(
  viewer: BoardViewer,
  input: { id: string; body: string; photoIds: string[] },
): Promise<BoardResult> {
  const body = cleanBody(input.body);
  const photoIds = cleanIds(input.photoIds);
  if (!photoIds) return { fout: "Een van de foto's klopt niet. Kies hem opnieuw." };
  const problem = bodyProblem(body, photoIds.length);
  if (problem) return { fout: problem };

  const result = await db().begin(async (tx): Promise<BoardResult> => {
    const post = await readPost(input.id, tx, true);
    if (!post || !visibleTo(post, viewer)) return { fout: NO_LONGER };
    const own = ownPost(post, viewer);
    const rights = rightsFor(post.channel, viewer);
    if (viewer.admin === null && !(own && rights.editOwn)) {
      return { fout: own ? refusal(rights) : "Je kunt alleen je eigen berichten bewerken." };
    }
    // The spelleiding changes someone else's post: the post says so, and the logbook keeps the old text.
    const asAdmin = viewer.admin !== null && !own;

    const added = photoIds.filter((id) => !post.photoIds.includes(id));
    const removed = post.photoIds.filter((id) => !photoIds.includes(id));
    const photoError = await photoProblem(
      added,
      { participantIds: viewer.names.map((n) => n.id), staff: viewer.admin !== null },
      post.id,
      tx,
    );
    if (photoError) return { fout: photoError };
    if (body === post.body && added.length === 0 && removed.length === 0) return { ok: true };

    await tx`
      update valk.board_posts set
        body = ${body}, photo_ids = ${photoIds}::uuid[], edited_at = now(),
        edited_by = ${asAdmin || post.authorStaff ? STAFF_AUTHOR : post.authorName}
      where id = ${post.id}
    `;
    if (removed.length > 0) await tx`delete from valk.uploads where kind = 'bord' and id = any(${removed}::uuid[])`;
    if (viewer.admin && (asAdmin || post.authorStaff)) {
      await logAudit(
        viewer.admin,
        {
          action: "bord.bericht",
          entity: "bericht",
          entityId: post.id,
          oldValue: { kanaal: post.channel.title, auteur: post.authorName, tekst: post.body, fotos: post.photoIds.length },
          newValue: { tekst: body, fotos: photoIds.length },
        },
        tx,
        "live",
      );
    }
    return { ok: true };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

/**
 * Delete a post, with its replies, reactions and photos. Your own post
 * always (also in a read-only channel); any post for the admin.
 */
export async function removePost(viewer: BoardViewer, id: string): Promise<BoardResult> {
  const result = await db().begin(async (tx): Promise<BoardResult> => {
    const post = await readPost(id, tx, true);
    if (!post || !visibleTo(post, viewer)) return { fout: NO_LONGER };
    const own = ownPost(post, viewer);
    if (!own && viewer.admin === null) return { fout: "Je kunt alleen je eigen berichten verwijderen." };

    const photos = await tx<{ photo_ids: string[] }[]>`
      select photo_ids from valk.board_posts where id = ${post.id} or parent_id = ${post.id}
    `;
    const photoIds = photos.flatMap((p) => p.photo_ids);
    await tx`delete from valk.board_posts where id = ${post.id}`;
    if (photoIds.length > 0) await tx`delete from valk.uploads where kind = 'bord' and id = any(${photoIds}::uuid[])`;
    if (viewer.admin && !own) {
      // The whole text goes into the logbook, so a mistake can be put right by hand.
      await logAudit(
        viewer.admin,
        {
          action: "bord.bericht.verwijderd",
          entity: "bericht",
          entityId: post.id,
          oldValue: {
            kanaal: post.channel.title,
            auteur: post.authorName,
            tekst: post.body,
            fotos: post.photoIds.length,
            reacties: post.replyCount,
          },
        },
        tx,
        "live",
      );
    }
    return { ok: true };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

/** A heart or a thumb on or off, for one of the names on this phone. */
export async function setReaction(
  viewer: BoardViewer,
  input: { postId: string; kind: ReactionKind; as: string; on: boolean },
): Promise<BoardResult> {
  if (input.kind !== "hart" && input.kind !== "duim") return { fout: "Dat kan niet." };
  const name = viewer.names.find((n) => n.id === input.as);
  const sql = db();
  const post = await readPost(input.postId, sql);
  if (!post || !visibleTo(post, viewer)) return { fout: NO_LONGER };
  const rights = rightsFor(post.channel, viewer);
  if (!rights.react) return { fout: refusal(rights) };
  if (!name) return { fout: "Kies een naam die bij deze telefoon hoort." };
  if (input.on) {
    await sql`
      insert into valk.board_reactions (post_id, participant_id, kind)
      values (${post.id}, ${name.id}, ${input.kind})
      on conflict do nothing
    `;
  } else {
    await sql`
      delete from valk.board_reactions where post_id = ${post.id} and participant_id = ${name.id} and kind = ${input.kind}
    `;
  }
  await ringBoard();
  return { ok: true };
}

/** The admin hides a post (and with it the replies underneath), or shows it again. */
export async function setPostHidden(viewer: BoardViewer, id: string, hidden: boolean): Promise<BoardResult> {
  if (!viewer.admin) return { fout: "Alleen de beheerder kan berichten verbergen." };
  const admin = viewer.admin;
  const result = await db().begin(async (tx): Promise<BoardResult> => {
    const post = await readPost(id, tx, true);
    if (!post) return { fout: NO_LONGER };
    if (post.hidden === hidden) return { ok: true };
    await tx`update valk.board_posts set hidden = ${hidden}::boolean where id = ${post.id}`;
    await logAudit(
      admin,
      {
        action: hidden ? "bord.bericht.verborgen" : "bord.bericht.zichtbaar",
        entity: "bericht",
        entityId: post.id,
        newValue: { kanaal: post.channel.title, auteur: post.authorName, tekst: excerpt(post.body) },
      },
      tx,
      "live",
    );
    return { ok: true };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

/* ------------------------------------------------------------------------ */
/* Channels (admin)                                                          */
/* ------------------------------------------------------------------------ */

export type ChannelInput = {
  title: string;
  description: string | null;
  sort: number;
  pinned: boolean;
  staffOnly: boolean;
  readOnly: boolean;
};

export type AdminChannel = FeedChannel & {
  sort: number;
  /** Top-level posts and replies, hidden ones included. */
  posts: number;
  replies: number;
  hiddenPosts: number;
  lastAt: string | null;
};

export async function adminChannels(): Promise<AdminChannel[]> {
  const rows = await db()<(ChannelRow & { posts: number; replies: number; hidden_posts: number; last_at: Date | null })[]>`
    select c.id, c.title, c.description, c.sort, c.pinned, c.staff_only, c.read_only,
      (count(p.id) filter (where p.parent_id is null))::int as posts,
      (count(p.id) filter (where p.parent_id is not null))::int as replies,
      (count(p.id) filter (where p.hidden))::int as hidden_posts,
      max(p.created_at) as last_at
    from valk.board_channels c
    left join valk.board_posts p on p.channel_id = c.id
    group by c.id
    order by c.pinned desc, c.sort, lower(c.title)
  `;
  return rows.map((row) => ({
    ...toChannel(row),
    sort: row.sort,
    posts: row.posts,
    replies: row.replies,
    hiddenPosts: row.hidden_posts,
    lastAt: row.last_at?.toISOString() ?? null,
  }));
}

/** Create (id null) or change a channel. */
export async function saveChannel(admin: Actor, id: string | null, input: ChannelInput): Promise<BoardResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { fout: "Dit kanaal bestaat niet meer." };
  const result = await db().begin(async (tx): Promise<BoardResult<{ id: string }>> => {
    const [same] = await tx<{ id: string }[]>`
      select id from valk.board_channels
      where lower(btrim(title)) = lower(${input.title}) and (${id}::uuid is null or id <> ${id}::uuid)
      limit 1
    `;
    if (same) return { fout: "Er is al een kanaal met die naam." };
    const values = {
      titel: input.title,
      beschrijving: input.description,
      volgorde: input.sort,
      vastgezet: input.pinned,
      "alleen spelleiding": input.staffOnly,
      "alleen lezen": input.readOnly,
    };
    if (id === null) {
      const [row] = await tx<{ id: string }[]>`
        insert into valk.board_channels (title, description, sort, pinned, staff_only, read_only)
        values (${input.title}, ${input.description}, ${input.sort}, ${input.pinned}::boolean, ${input.staffOnly}::boolean, ${input.readOnly}::boolean)
        returning id
      `;
      await logAudit(admin, { action: "bord.kanaal.toegevoegd", entity: "kanaal", entityId: row.id, newValue: values }, tx, "live");
      return { ok: true, id: row.id };
    }
    const [before] = await tx<ChannelRow[]>`
      select id, title, description, sort, pinned, staff_only, read_only from valk.board_channels where id = ${id} for update
    `;
    if (!before) return { fout: "Dit kanaal bestaat niet meer." };
    await tx`
      update valk.board_channels set
        title = ${input.title}, description = ${input.description}, sort = ${input.sort},
        pinned = ${input.pinned}::boolean, staff_only = ${input.staffOnly}::boolean, read_only = ${input.readOnly}::boolean,
        updated_at = now()
      where id = ${id}
    `;
    await logAudit(
      admin,
      {
        action: "bord.kanaal",
        entity: "kanaal",
        entityId: id,
        oldValue: {
          titel: before.title,
          beschrijving: before.description,
          volgorde: before.sort,
          vastgezet: before.pinned,
          "alleen spelleiding": before.staff_only,
          "alleen lezen": before.read_only,
        },
        newValue: values,
      },
      tx,
      "live",
    );
    return { ok: true, id };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

/** Only an empty channel can go: the board keeps everyone's posts. */
export async function removeChannel(admin: Actor, id: string): Promise<BoardResult> {
  if (!isUuid(id)) return { fout: "Dit kanaal bestaat niet meer." };
  const result = await db().begin(async (tx): Promise<BoardResult> => {
    const [row] = await tx<{ title: string; posts: number }[]>`
      select title, (select count(*)::int from valk.board_posts p where p.channel_id = c.id) as posts
      from valk.board_channels c where id = ${id} for update
    `;
    if (!row) return { fout: "Dit kanaal bestaat niet meer." };
    if (row.posts > 0) return { fout: "Er staan nog berichten in dit kanaal. Zet het liever op alleen lezen." };
    await tx`delete from valk.board_channels where id = ${id}`;
    await logAudit(admin, { action: "bord.kanaal.verwijderd", entity: "kanaal", entityId: id, oldValue: { titel: row.title } }, tx, "live");
    return { ok: true };
  });
  if ("ok" in result) await ringBoard();
  return result;
}

export async function nextChannelSort(): Promise<number> {
  const [row] = await db()<{ next: number }[]>`select (coalesce(max(sort), 0) + 1)::int as next from valk.board_channels`;
  return Math.min(99, row?.next ?? 1);
}

export type ModerationPost = FeedPost & { channelId: string; channelTitle: string };

/** The newest posts and replies of all channels, hidden ones included. */
export async function recentPosts(options: { onlyHidden: boolean; limit: number; viewer: BoardViewer }): Promise<{
  posts: ModerationPost[];
  more: boolean;
}> {
  const sql = db();
  const rows = await sql<(PostRow & { channel_title: string })[]>`
    select p.id, p.channel_id, p.parent_id, p.participant_id,
      coalesce(nullif(btrim(pa.nickname), ''), pa.name, p.author_name) as author,
      p.author_staff, p.body, p.photo_ids, p.hidden, p.created_at, p.edited_at, p.edited_by,
      (select count(*)::int from valk.board_posts r where r.parent_id = p.id) as reply_count,
      c.title as channel_title
    from valk.board_posts p
    join valk.board_channels c on c.id = p.channel_id
    left join valk.participants pa on pa.id = p.participant_id
    where (not ${options.onlyHidden}::boolean or p.hidden)
    order by p.created_at desc
    limit ${options.limit + 1}
  `;
  const page = rows.slice(0, options.limit);
  const decorated = await decorate(page, options.viewer, sql);
  return {
    posts: page.map((row) => ({ ...decorated.get(row.id)!, channelId: row.channel_id, channelTitle: row.channel_title })),
    more: rows.length > options.limit,
  };
}
