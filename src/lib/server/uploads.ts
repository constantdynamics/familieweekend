import "server-only";
import { db } from "./db";
import { hmacSha256, toBase64Url } from "./keys";

/**
 * Photos live in valk.uploads (not in Supabase Storage, so the shared
 * project's service key is never needed). They are only reachable through a
 * signed link that expires soon, and the photo route also needs the family
 * session.
 */

export type UploadKind = "funfact" | "ai" | "bord" | "quiz";
export const MAX_UPLOAD_BYTES = 3_000_000;

export type UploadMeta = {
  id: string;
  kind: UploadKind;
  participantId: string | null;
  originalId: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  quizVariant: "echt" | "ai" | null;
  createdAt: string;
};

/** Sniff the real type from the first bytes; never trust the file name. */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function saveUpload(input: {
  kind: UploadKind;
  bytes: Uint8Array;
  mime: string;
  width?: number | null;
  height?: number | null;
  participantId?: string | null;
  originalId?: string | null;
  createdBy: string;
}): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    insert into valk.uploads (kind, participant_id, original_id, mime, bytes, width, height, size_bytes, created_by)
    values (
      ${input.kind}, ${input.participantId ?? null}, ${input.originalId ?? null}, ${input.mime},
      ${Buffer.from(input.bytes)}, ${input.width ?? null}, ${input.height ?? null}, ${input.bytes.length}, ${input.createdBy}
    )
    returning id
  `;
  return row.id;
}

type MetaRow = {
  id: string;
  kind: UploadKind;
  participant_id: string | null;
  original_id: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  quiz_variant: "echt" | "ai" | null;
  created_at: Date;
};

function toMeta(row: MetaRow): UploadMeta {
  return {
    id: row.id,
    kind: row.kind,
    participantId: row.participant_id,
    originalId: row.original_id,
    mime: row.mime,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    quizVariant: row.quiz_variant,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getUploadMeta(id: string): Promise<UploadMeta | null> {
  const [row] = await db()<MetaRow[]>`
    select id, kind, participant_id, original_id, mime, width, height, size_bytes, quiz_variant, created_at
    from valk.uploads where id = ${id}
  `;
  return row ? toMeta(row) : null;
}

export async function readUploadBytes(id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const [row] = await db()<{ mime: string; bytes: Buffer }[]>`select mime, bytes from valk.uploads where id = ${id}`;
  return row ? { mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
}

export async function deleteUpload(id: string): Promise<void> {
  await db()`delete from valk.uploads where id = ${id}`;
}

async function signature(id: string, expires: number): Promise<string> {
  return toBase64Url(await hmacSha256("photo", `${id}.${expires}`)).slice(0, 32);
}

/** A link to the photo that works for `ttlSeconds` (default 10 minutes). */
export async function signedPhotoUrl(id: string, ttlSeconds = 600): Promise<string> {
  // Round up to the minute so a page renders the same link for a while (cacheable).
  const expires = Math.ceil((Date.now() / 1000 + ttlSeconds) / 60) * 60;
  return `/api/foto/${id}?t=${expires}&s=${await signature(id, expires)}`;
}

export async function verifyPhotoSignature(id: string, expires: number, sig: string): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const expected = await signature(id, expires);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Photos that were uploaded but never used (a fun fact that was replaced, a
 * board post that was never sent). Runs with the daily keepalive.
 */
export async function deleteOrphanUploads(): Promise<number> {
  const rows = await db()`
    delete from valk.uploads u
    where u.created_at < now() - interval '1 day'
      and u.kind in ('funfact', 'bord')
      and not exists (
        select 1 from valk.funfact_answers a where a.value ->> 'upload' = u.id::text
      )
      and not exists (
        select 1 from valk.board_posts p where u.id = any (p.photo_ids)
      )
      and not exists (
        select 1 from valk.quiz_questions q where q.photo_upload_id = u.id
      )
    returning u.id
  `;
  return rows.length;
}
