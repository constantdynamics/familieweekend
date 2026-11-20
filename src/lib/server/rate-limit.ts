import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { hmacSha256, toBase64Url } from "./keys";

export const ATTEMPT_WINDOW_MINUTES = 10;

/** Limits per window. PINs: 5 per device and role, as the spec asks. */
export const LIMITS = {
  pinPerDevice: 5,
  pinPerNetwork: 30,
  familyCodePerNetwork: 20,
} as const;

export type AttemptKind = "familiecode" | `pin:${string}`;

export type LimitStatus = {
  blocked: boolean;
  remaining: number;
  /** When the oldest counted failure leaves the window (only when blocked). */
  retryAt: Date | null;
};

export async function checkLimit(kind: AttemptKind, subject: string, max: number): Promise<LimitStatus> {
  const rows = await db()<{ created_at: Date }[]>`
    select created_at
    from valk.login_attempts
    where kind = ${kind}
      and subject = ${subject}
      and not success
      and created_at > now() - make_interval(mins => ${ATTEMPT_WINDOW_MINUTES})
    order by created_at asc
  `;
  const failures = rows.length;
  if (failures < max) return { blocked: false, remaining: max - failures, retryAt: null };
  const oldestCounted = rows[failures - max].created_at;
  return {
    blocked: true,
    remaining: 0,
    retryAt: new Date(oldestCounted.getTime() + ATTEMPT_WINDOW_MINUTES * 60_000),
  };
}

export async function recordAttempt(kind: AttemptKind, subject: string, success: boolean): Promise<void> {
  await db()`insert into valk.login_attempts (kind, subject, success) values (${kind}, ${subject}, ${success})`;
}

/** The caller's network, as a keyed hash. Raw IP addresses are never stored. */
export async function networkSubject(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "onbekend";
  return `net:${toBase64Url(await hmacSha256("ip-hash", ip)).slice(0, 22)}`;
}
