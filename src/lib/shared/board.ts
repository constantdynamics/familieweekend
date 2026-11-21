/**
 * The prikbord (message board), shared by the server and the phone: limits,
 * cleaning and checking text, safe links, relative times in Dutch, who may
 * do what, and the shape of what the board API returns. Pure functions,
 * tested in tests/unit/board.test.ts.
 */
import { bijElkaar } from "./tekst";
import { amsterdamParts, formatDayMonth, formatTime, TIME_ZONE } from "./time";

export const BOARD = {
  /** Characters in one post or reply. */
  maxBody: 1000,
  maxLines: 40,
  maxPhotos: 4,
  /** Flood limit: at most this many posts per name… */
  floodPosts: 10,
  /** …within this many minutes. */
  floodMinutes: 5,
  maxChannelTitle: 60,
  maxChannelDescription: 200,
  /** Top-level posts per page; "Toon meer" adds another page. */
  pageSize: 30,
  maxPageSize: 300,
  /** Board photos are family content: their signed links last an hour. */
  photoTtlSeconds: 3600,
} as const;

/** Name above posts of the admin ("Plaats als De spelleiding"). */
export const STAFF_AUTHOR = "De spelleiding";
/** The "Plaats als" value for the spelleiding. */
export const STAFF_AS = "spelleiding";

export type BoardSort = "nieuw" | "populair";
export type ReactionKind = "hart" | "duim";

export function parseSort(value: unknown): BoardSort {
  return value === "populair" ? "populair" : "nieuw";
}

/** Number of top-level posts to show: whole pages, at least one, capped. */
export function parseLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= BOARD.pageSize) return BOARD.pageSize;
  return Math.min(BOARD.maxPageSize, Math.ceil(n / BOARD.pageSize) * BOARD.pageSize);
}

/* ------------------------------------------------------------------------ */
/* What the board API returns (server and phone use the same shape).        */
/* ------------------------------------------------------------------------ */

export type FeedPhoto = { id: string; url: string; width: number | null; height: number | null };

export type FeedPost = {
  id: string;
  parentId: string | null;
  /** The name shown above the post. */
  author: string;
  /** Posted as "De spelleiding". */
  staff: boolean;
  body: string;
  photos: FeedPhoto[];
  createdAt: string;
  editedAt: string | null;
  /** Edited by the spelleiding rather than by the author. */
  editedByStaff: boolean;
  /** Only ever true for the admin: the family never receives hidden posts. */
  hidden: boolean;
  /** Written by one of the names on this phone. */
  mine: boolean;
  hearts: number;
  thumbs: number;
  /** The names on this phone that gave a heart or a thumb. */
  myHearts: string[];
  myThumbs: string[];
  /** Replies (top-level posts only; empty for a reply). */
  replies: FeedPost[];
  replyCount: number;
};

export type FeedChannel = {
  id: string;
  title: string;
  description: string | null;
  pinned: boolean;
  staffOnly: boolean;
  readOnly: boolean;
};

export type ViewerReason = "geen-naam" | "proef" | "bekijk-als" | null;

export type BoardNotice = "geen-naam" | "proef" | "bekijk-als" | "dicht" | "alleen-lezen" | "spelleiding" | null;

export type FeedViewer = {
  isAdmin: boolean;
  /** The names on this phone (empty in the test environment or while viewing as someone). */
  names: { id: string; name: string }[];
  /** Who you can post as in this channel ("spelleiding" for the admin). */
  authors: { id: string; name: string }[];
  canReact: boolean;
  canEditOwn: boolean;
  notice: BoardNotice;
};

export type ChannelFeed = {
  /** Board version this data belongs to. */
  v: number;
  channel: FeedChannel;
  posts: FeedPost[];
  /** Visible top-level posts in this channel. */
  total: number;
  sort: BoardSort;
  limit: number;
  viewer: FeedViewer;
};

export type ChannelSummary = FeedChannel & {
  /** Top-level posts, as the channel itself counts them. */
  posts: number;
  replies: number;
  lastAt: string | null;
  lastAuthor: string | null;
};

export type ChannelList = {
  v: number;
  channels: ChannelSummary[];
  /** The names on this phone, for "Je plaatst als …". */
  names: string[];
  reason: ViewerReason;
  boardOpen: boolean;
};

/* ------------------------------------------------------------------------ */
/* Who may do what.                                                          */
/* ------------------------------------------------------------------------ */

export type Rights = {
  /** Post and reply with one of the names on this phone. */
  post: boolean;
  /** Give hearts and thumbs. */
  react: boolean;
  /** Edit your own posts. Deleting your own post is always allowed. */
  editOwn: boolean;
  /** Post as "De spelleiding" (the admin, everywhere). */
  staffPost: boolean;
  /** What to tell the family about this channel, if anything. */
  notice: BoardNotice;
};

export function boardRights(
  channel: { staffOnly: boolean; readOnly: boolean },
  viewer: { isAdmin: boolean; hasNames: boolean; reason: ViewerReason; boardOpen: boolean },
): Rights {
  const open = viewer.boardOpen && !channel.readOnly;
  const names = viewer.hasNames && viewer.reason === null;
  const notice: BoardNotice =
    viewer.reason ?? (!viewer.boardOpen ? "dicht" : channel.readOnly ? "alleen-lezen" : channel.staffOnly ? "spelleiding" : null);
  return {
    post: names && open && !channel.staffOnly,
    react: names && open,
    editOwn: names && open,
    staffPost: viewer.isAdmin,
    notice,
  };
}

/* ------------------------------------------------------------------------ */
/* Text: cleaning, checking and safe links.                                  */
/* ------------------------------------------------------------------------ */

/** Control characters and the invisible ones that can disguise text (bidi overrides). */
function invisible(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x0a) ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200b ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/**
 * Tidy a post before it is stored: one kind of line break, no control or
 * invisible characters, no trailing spaces, at most one empty line in a row.
 */
export function cleanBody(text: string): string {
  const normal = text.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  let out = "";
  for (const char of normal) {
    if (!invisible(char.codePointAt(0) ?? 0)) out += char;
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[  ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What is wrong with a (cleaned) post, in Dutch, or null. */
export function bodyProblem(body: string, photos: number): string | null {
  if (!body && photos === 0) return "Schrijf eerst iets, of kies een foto.";
  if (body.length > BOARD.maxBody) {
    return `Dat is te lang: maximaal ${BOARD.maxBody} tekens, en dit zijn er ${body.length}.`;
  }
  if (body.split("\n").length > BOARD.maxLines) return "Dat zijn veel regels. Maak het bericht wat korter.";
  if (photos > BOARD.maxPhotos) return `Je kunt maximaal ${BOARD.maxPhotos} foto's plaatsen.`;
  return null;
}

export type Segment = { link: false; text: string } | { link: true; text: string; href: string };
/** A paragraph is a list of lines; a line is a list of segments. */
export type Paragraph = Segment[][];

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const NBSP = " ";

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Sentence punctuation right after a link belongs to the sentence. */
function trimLink(raw: string): string {
  let url = raw;
  while (/[.,;:!?'")\]}>]$/.test(url)) {
    if (url.endsWith(")") && count(url, "(") >= count(url, ")")) break;
    url = url.slice(0, -1);
  }
  return url;
}

/** Only http and https, and only to a real host. Anything else stays plain text. */
export function safeHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function linkify(line: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of line.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start < last) continue;
    const text = trimLink(match[0]);
    const href = safeHref(text);
    if (!href) continue;
    if (start > last) segments.push({ link: false, text: line.slice(last, start) });
    segments.push({ link: true, text, href });
    last = start + text.length;
  }
  if (last < line.length) segments.push({ link: false, text: line.slice(last) });
  return segments;
}

/**
 * Keep the last two words of a line together, so a line never ends with one
 * lonely word; a short line without links stays whole (like bijElkaar).
 */
function glue(segments: Segment[]): Segment[] {
  if (segments.length === 1 && !segments[0].link) {
    return [{ link: false, text: bijElkaar(segments[0].text) }];
  }
  const out = segments.map((s) => ({ ...s }));
  // Links hold no spaces, so the last space of the line is in a text segment.
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const segment = out[i];
    if (segment.link) continue;
    const at = segment.text.lastIndexOf(" ");
    if (at === -1) continue;
    out[i] = { link: false, text: `${segment.text.slice(0, at)}${NBSP}${segment.text.slice(at + 1)}` };
    break;
  }
  return out;
}

/**
 * Turn a stored post into paragraphs, lines and segments for rendering.
 * Everything stays text (React escapes it); only http(s) links become links.
 */
export function parseBody(body: string): Paragraph[] {
  if (!body) return [];
  return body
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.replace(/ {2,}/g, " ").trim())
        .filter((line) => line.trim() !== "")
        .map((line) => glue(linkify(line))),
    )
    .filter((paragraph) => paragraph.length > 0);
}

/** A short preview of a post for lists, on one line. */
export function excerpt(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* ------------------------------------------------------------------------ */
/* Times and counts in Dutch.                                                */
/* ------------------------------------------------------------------------ */

const weekday = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long" });

function dayNumber(date: Date): number {
  const p = amsterdamParts(date);
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
}

/**
 * "net", "5 minuten geleden", "2 uur geleden", "vandaag om 09:12",
 * "gisteren om 20:15", "dinsdag om 10:00", "12 maart" or "12 maart 2025".
 * Days follow the Amsterdam calendar. Never breaks over two lines.
 */
export function relativeTime(when: Date | string, now: number): string {
  const date = typeof when === "string" ? new Date(when) : when;
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  let text: string;
  if (minutes < 1) text = "net";
  else if (minutes < 60) text = minutes === 1 ? "1 minuut geleden" : `${minutes} minuten geleden`;
  else if (minutes < 180) text = `${Math.floor(minutes / 60)} uur geleden`;
  else {
    const days = dayNumber(new Date(now)) - dayNumber(date);
    const at = formatTime(date);
    if (days <= 0) text = `vandaag om ${at}`;
    else if (days === 1) text = `gisteren om ${at}`;
    else if (days < 7) text = `${weekday.format(date)} om ${at}`;
    else if (amsterdamParts(date).year === amsterdamParts(new Date(now)).year) text = formatDayMonth(date);
    else text = `${formatDayMonth(date)} ${amsterdamParts(date).year}`;
  }
  return text.replaceAll(" ", NBSP);
}

/** "1 bericht", "3 berichten": the number and the word stay together. */
export function aantal(n: number, een: string, meer: string): string {
  return `${n}${NBSP}${n === 1 ? een : meer}`;
}

/** "SV" for Sanne Valkenburg, "T" for Tim. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length >= 2 ? [words[0], words[words.length - 1]] : words;
  return picked.map((word) => ([...word][0] ?? "").toUpperCase()).join("");
}

/* ------------------------------------------------------------------------ */
/* Flood limit.                                                              */
/* ------------------------------------------------------------------------ */

/**
 * At most `BOARD.floodPosts` posts per name within `BOARD.floodMinutes`.
 * `recent` are the times of this name's latest posts. When blocked, says
 * when the next post is allowed.
 */
export function floodCheck(recent: Date[], now: number): { blocked: boolean; retryAt: Date | null } {
  const windowMs = BOARD.floodMinutes * 60_000;
  const inWindow = recent
    .map((d) => d.getTime())
    .filter((t) => t > now - windowMs)
    .sort((a, b) => b - a);
  if (inWindow.length < BOARD.floodPosts) return { blocked: false, retryAt: null };
  return { blocked: true, retryAt: new Date(inWindow[BOARD.floodPosts - 1] + windowMs) };
}

/* ------------------------------------------------------------------------ */
/* On the phone: optimistic reactions and stable photo links.               */
/* ------------------------------------------------------------------------ */

export type ReactionChange = { postId: string; kind: ReactionKind; by: string; on: boolean };

function reactOne(post: FeedPost, change: ReactionChange): FeedPost {
  const mine = change.kind === "hart" ? post.myHearts : post.myThumbs;
  if (mine.includes(change.by) === change.on) return post;
  const names = change.on ? [...mine, change.by] : mine.filter((id) => id !== change.by);
  const step = change.on ? 1 : -1;
  return change.kind === "hart"
    ? { ...post, myHearts: names, hearts: Math.max(0, post.hearts + step) }
    : { ...post, myThumbs: names, thumbs: Math.max(0, post.thumbs + step) };
}

/**
 * Show a heart or thumb right away. Setting (not toggling) keeps it right
 * when fresh data from the server already has the change.
 */
export function applyReaction(posts: FeedPost[], change: ReactionChange): FeedPost[] {
  return posts.map((post) => {
    if (post.id === change.postId) return reactOne(post, change);
    if (!post.replies.some((r) => r.id === change.postId)) return post;
    return { ...post, replies: post.replies.map((r) => (r.id === change.postId ? reactOne(r, change) : r)) };
  });
}

/** When a signed photo link stops working (seconds), or null. */
export function photoExpiry(url: string): number | null {
  const match = /[?&]t=(\d+)/.exec(url);
  return match ? Number(match[1]) : null;
}

/**
 * Every fetch signs the photo links again. Keep the link the phone already
 * has while it is valid for a while, so photos are not downloaded twice.
 */
export function keepPhotoUrls(next: FeedPost[], previous: FeedPost[], nowSeconds: number, margin = 300): FeedPost[] {
  const known = new Map<string, string>();
  const collect = (post: FeedPost) => {
    for (const photo of post.photos) {
      const expires = photoExpiry(photo.url);
      if (expires !== null && expires - nowSeconds > margin) known.set(photo.id, photo.url);
    }
    post.replies.forEach(collect);
  };
  previous.forEach(collect);
  if (known.size === 0) return next;
  const fix = (post: FeedPost): FeedPost => ({
    ...post,
    photos: post.photos.map((photo) => {
      const url = known.get(photo.id);
      return url ? { ...photo, url } : photo;
    }),
    replies: post.replies.map(fix),
  });
  return next.map(fix);
}
