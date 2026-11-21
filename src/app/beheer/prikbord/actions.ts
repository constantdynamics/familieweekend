"use server";

import { refresh, updateTag } from "next/cache";
import type { Actor } from "@/lib/server/audit";
import {
  boardViewer,
  createPost,
  editPost,
  removeChannel,
  removePost,
  saveChannel,
  setPostHidden,
  type BoardResult,
  type BoardViewer,
} from "@/lib/server/board";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { requireAdmin } from "@/lib/server/session";
import { getSettings, setSettingsFlag, SETTINGS_TAG } from "@/lib/server/settings";
import { BOARD, STAFF_AS } from "@/lib/shared/board";

/*
 * The admin screen of the prikbord. Same rules as on the board itself (the
 * board library checks them), but these re-render the admin page.
 */

export type KanaalState = { fout?: string; gelukt?: string; velden?: Record<string, string> };
export type BeheerResult = { ok: true } | { fout: string };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheer(): Promise<{ actor: Actor; viewer: BoardViewer }> {
  const staff = await requireAdmin();
  const [ctx, settings] = await Promise.all([getActionContext(), getSettings()]);
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, viewer: boardViewer(ctx, settings) };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").replace(/\s+/g, " ").trim();
}

async function run(where: string, work: (viewer: BoardViewer) => Promise<BoardResult>): Promise<BeheerResult> {
  const { viewer } = await beheer();
  try {
    const result = await work(viewer);
    if ("fout" in result) return { fout: result.fout };
    refresh();
    return { ok: true };
  } catch (error) {
    logError(where, error);
    return { fout: ONZE_KANT };
  }
}

/* Open or close the board for the family (they can always read). */
export async function zetPrikbordOpen(formData: FormData): Promise<void> {
  const { actor } = await beheer();
  try {
    await setSettingsFlag("boardOpen", formData.get("waarde") === "1", actor);
    updateTag(SETTINGS_TAG);
    await Promise.all([ring("live"), ring("test")]);
    refresh();
  } catch (error) {
    logError("beheer.prikbord.open", error);
  }
}

/* A new channel (no id) or changes to one. */
export async function bewaarKanaal(_previous: KanaalState, formData: FormData): Promise<KanaalState> {
  const { actor } = await beheer();
  const id = String(formData.get("id") ?? "") || null;
  const title = text(formData, "titel");
  const description = text(formData, "beschrijving") || null;
  const sort = Number(formData.get("volgorde"));
  const velden: Record<string, string> = {};
  if (!title) velden.titel = "Geef het kanaal een naam.";
  if (title.length > BOARD.maxChannelTitle) velden.titel = `Houd de naam korter dan ${BOARD.maxChannelTitle} tekens.`;
  if (description && description.length > BOARD.maxChannelDescription) {
    velden.beschrijving = `Houd de beschrijving korter dan ${BOARD.maxChannelDescription} tekens.`;
  }
  if (!Number.isInteger(sort) || sort < 1 || sort > 99) velden.volgorde = "Kies een volgorde van 1 tot 99.";
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    const result = await saveChannel(actor, id, {
      title,
      description,
      sort,
      pinned: formData.get("vastgezet") === "on",
      staffOnly: formData.get("spelleiding") === "on",
      readOnly: formData.get("alleenlezen") === "on",
    });
    if ("fout" in result) {
      return { fout: result.fout, velden: result.fout.includes("naam") ? { titel: "Kies een andere naam." } : {} };
    }
    refresh();
    return { gelukt: id ? "Kanaal bewaard." : `Kanaal "${title}" toegevoegd.` };
  } catch (error) {
    logError("beheer.prikbord.kanaal", error);
    return { fout: ONZE_KANT };
  }
}

/* Only an empty channel can be deleted. */
export async function verwijderKanaal(_previous: KanaalState, formData: FormData): Promise<KanaalState> {
  const { actor } = await beheer();
  try {
    const result = await removeChannel(actor, String(formData.get("id") ?? ""));
    if ("fout" in result) return { fout: result.fout };
    refresh();
    return { gelukt: "Kanaal verwijderd." };
  } catch (error) {
    logError("beheer.prikbord.kanaal.verwijderen", error);
    return { fout: ONZE_KANT };
  }
}

/* Post as "De spelleiding" in any channel. */
export async function plaatsAlsSpelleiding(input: { kanaal: string; tekst: string; fotos: string[] }): Promise<BeheerResult> {
  return run("beheer.prikbord.plaatsen", (viewer) =>
    createPost(viewer, {
      channelId: String(input?.kanaal ?? ""),
      parentId: null,
      body: String(input?.tekst ?? "").slice(0, 20_000),
      photoIds: Array.isArray(input?.fotos) ? input.fotos.filter((f) => typeof f === "string").slice(0, 10) : [],
      as: STAFF_AS,
    }),
  );
}

export async function verbergBerichtBeheer(input: { id: string; verborgen: boolean }): Promise<BeheerResult> {
  return run("beheer.prikbord.verbergen", (viewer) => setPostHidden(viewer, String(input?.id ?? ""), input?.verborgen === true));
}

export async function bewerkBerichtBeheer(input: { id: string; tekst: string; fotos: string[] }): Promise<BeheerResult> {
  return run("beheer.prikbord.bewerken", (viewer) =>
    editPost(viewer, {
      id: String(input?.id ?? ""),
      body: String(input?.tekst ?? "").slice(0, 20_000),
      photoIds: Array.isArray(input?.fotos) ? input.fotos.filter((f) => typeof f === "string").slice(0, 10) : [],
    }),
  );
}

export async function verwijderBerichtBeheer(input: { id: string }): Promise<BeheerResult> {
  return run("beheer.prikbord.verwijderen", (viewer) => removePost(viewer, String(input?.id ?? "")));
}
