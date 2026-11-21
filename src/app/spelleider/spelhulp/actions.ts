"use server";

import { refresh } from "next/cache";
import { getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { requireStaff } from "@/lib/server/session";
import { deleteDeck, saveDeck } from "@/lib/server/spelhulp";
import { isUuid } from "@/lib/server/teams";
import { parseCardList } from "@/lib/shared/zeskamp";

export type KaartjesState = { fout?: string; gelukt?: string; velden?: Record<string, string>; id?: string };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

/** A new deck, or new cards for an existing one: one word or task per line. */
export async function bewaarKaartjes(_previous: KaartjesState, formData: FormData): Promise<KaartjesState> {
  const staff = await requireStaff();
  const ctx = await getActionContext();
  const rawId = String(formData.get("id") ?? "");
  const id = isUuid(rawId) ? rawId : null;
  const name = String(formData.get("naam") ?? "").replace(/\s+/g, " ").trim();
  const cards = parseCardList(String(formData.get("kaartjes") ?? ""));
  const velden: Record<string, string> = {};
  if (!name) velden.naam = "Geef de stapel een naam.";
  if (name.length > 60) velden.naam = "Houd de naam korter dan 60 tekens.";
  if (cards.length === 0) velden.kaartjes = "Plak minstens één woord of opdracht, één per regel.";
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    const saved = await saveDeck(ctx.env, { id, name, cards }, { id: staff.staffId, name: staff.name, role: staff.role });
    if (!saved) return { fout: "Deze stapel bestaat niet meer. Maak hem opnieuw." };
    refresh();
    return { gelukt: cards.length === 1 ? "1 kaartje bewaard." : `${cards.length} kaartjes bewaard.`, id: saved };
  } catch (error) {
    logError("spelhulp.bewaren", error);
    return { fout: ONZE_KANT };
  }
}

export async function verwijderKaartjes(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const ctx = await getActionContext();
  const id = String(formData.get("id") ?? "");
  try {
    await deleteDeck(ctx.env, id, { id: staff.staffId, name: staff.name, role: staff.role });
    refresh();
  } catch (error) {
    logError("spelhulp.verwijderen", error);
  }
}
