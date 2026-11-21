import "server-only";
import type { RequestContext } from "../context";
import { readVersion } from "../live";
import { getSettings } from "../settings";
import type { QuizView } from "./types";

/** Quiz responses are never stored by a browser, proxy or service worker. */
export const NO_STORE = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } as const;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function fout(message: string, status: number): Response {
  return json({ fout: message }, status);
}

/**
 * Writes only from pages of the app itself. Browsers send Origin with every
 * POST from a page; a request from another site is refused.
 */
export function fromOwnSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** A JSON body of at most a few kilobytes, or null. */
export async function readBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Until the owner releases the new app, only the admin plays along (the family sees the empty state). */
export async function quizOpenFor(ctx: RequestContext): Promise<boolean> {
  if (ctx.isAdmin) return true;
  const settings = await getSettings();
  return settings.fase2Live;
}

/** A view with nothing in it, for phones that may not see the quiz yet. */
export async function closedView(ctx: RequestContext): Promise<QuizView> {
  return {
    v: await readVersion(ctx.env),
    env: ctx.env,
    status: "rust",
    phase: null,
    title: null,
    round: null,
    nextRound: null,
    questionAt: null,
    question: null,
    luisterGoed: false,
    countdownMs: null,
    me: {
      role: "bezoeker",
      team: null,
      captainName: null,
      captainTakenOver: false,
      suggestCaptainLogin: false,
      canAnswer: false,
      canJoker: false,
      answer: null,
      teamAnswered: false,
    },
    teams: [],
    answeredCount: 0,
    jokers: [],
    standings: null,
    standingsHidden: false,
  };
}
