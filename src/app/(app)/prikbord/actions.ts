"use server";

import {
  boardReleased,
  boardViewer,
  createPost,
  editPost,
  removePost,
  setPostHidden,
  setReaction,
  type BoardResult,
  type BoardViewer,
} from "@/lib/server/board";
import { getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";

/*
 * Actions on the board itself. They only return a result: the phone fetches
 * the channel again through the board API, so the page is not rendered
 * again for every heart. Every action checks the role on the server.
 */

export type BoardActionResult = { ok: true; id?: string } | { fout: string };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function viewer(): Promise<BoardViewer | null> {
  const ctx = await getActionContext();
  if (!ctx.deviceId) return null;
  const settings = await getSettings();
  if (!boardReleased(ctx, settings)) return null;
  return boardViewer(ctx, settings);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 10) : [];
}

async function run<T extends object>(where: string, work: (v: BoardViewer) => Promise<BoardResult<T>>): Promise<BoardActionResult> {
  try {
    const v = await viewer();
    if (!v) return { fout: "Vul eerst de familiecode in." };
    const result = await work(v);
    return "fout" in result ? { fout: result.fout } : { ok: true, ...("id" in result ? { id: String(result.id) } : {}) };
  } catch (error) {
    logError(where, error);
    return { fout: ONZE_KANT };
  }
}

/** A new post (ouder null) or a reply. `als` is a name on this phone, or "spelleiding" for the admin. */
export async function plaatsBericht(input: {
  kanaal: string;
  ouder: string | null;
  tekst: string;
  fotos: string[];
  als: string;
}): Promise<BoardActionResult> {
  return run("prikbord.plaatsen", (v) =>
    createPost(v, {
      channelId: text(input?.kanaal),
      parentId: typeof input?.ouder === "string" ? input.ouder : null,
      body: text(input?.tekst).slice(0, 20_000),
      photoIds: ids(input?.fotos),
      as: text(input?.als),
    }),
  );
}

export async function bewerkBericht(input: { id: string; tekst: string; fotos: string[] }): Promise<BoardActionResult> {
  return run("prikbord.bewerken", (v) =>
    editPost(v, { id: text(input?.id), body: text(input?.tekst).slice(0, 20_000), photoIds: ids(input?.fotos) }),
  );
}

export async function verwijderBericht(input: { id: string }): Promise<BoardActionResult> {
  return run("prikbord.verwijderen", (v) => removePost(v, text(input?.id)));
}

export async function reageer(input: { id: string; soort: "hart" | "duim"; als: string; aan: boolean }): Promise<BoardActionResult> {
  return run("prikbord.reageren", (v) =>
    setReaction(v, {
      postId: text(input?.id),
      kind: input?.soort === "duim" ? "duim" : "hart",
      as: text(input?.als),
      on: input?.aan === true,
    }),
  );
}

/** Admin only: hide a post from the family, or show it again. */
export async function verbergBericht(input: { id: string; verborgen: boolean }): Promise<BoardActionResult> {
  return run("prikbord.verbergen", (v) => setPostHidden(v, text(input?.id), input?.verborgen === true));
}
