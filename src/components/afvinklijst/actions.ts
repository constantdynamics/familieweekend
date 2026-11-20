"use server";

import { refresh } from "next/cache";
import { addItem, addNote, deleteItem, deleteNote, setItemDone } from "@/lib/server/checklist";
import { logError } from "@/lib/server/log";
import { requireAdmin, requireStaff } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";

export type AfvinkState = { fout?: string; gelukt?: string };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

export async function vinkAf(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    await setItemDone(id, formData.get("af") === "1", { id: staff.staffId, name: staff.name, role: staff.role });
    refresh();
  } catch (error) {
    logError("afvinklijst.vinkje", error);
  }
}

export async function voegPuntToe(_previous: AfvinkState, formData: FormData): Promise<AfvinkState> {
  const staff = await requireAdmin();
  const title = String(formData.get("titel") ?? "").replace(/\s+/g, " ").trim();
  const detail = String(formData.get("uitleg") ?? "").trim() || null;
  if (!title) return { fout: "Vul in wat er moet gebeuren." };
  if (title.length > 120) return { fout: "Houd het korter dan 120 tekens." };
  try {
    await addItem(title, detail, { id: staff.staffId, name: staff.name, role: staff.role });
    refresh();
    return { gelukt: "Punt toegevoegd." };
  } catch (error) {
    logError("afvinklijst.toevoegen", error);
    return { fout: ONZE_KANT };
  }
}

export async function verwijderPunt(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    await deleteItem(id, { id: staff.staffId, name: staff.name, role: staff.role });
    refresh();
  } catch (error) {
    logError("afvinklijst.verwijderen", error);
  }
}

export async function plaatsNotitie(_previous: AfvinkState, formData: FormData): Promise<AfvinkState> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("notitie") ?? "").trim();
  if (!isUuid(id)) return { fout: "Dit punt bestaat niet meer." };
  if (!body) return { fout: "Schrijf eerst iets." };
  if (body.length > 1000) return { fout: "Houd je notitie korter dan 1000 tekens." };
  try {
    await addNote(id, body, { name: staff.name, role: staff.role });
    refresh();
    return { gelukt: "Notitie geplaatst." };
  } catch (error) {
    logError("afvinklijst.notitie", error);
    return { fout: ONZE_KANT };
  }
}

export async function verwijderNotitie(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    await deleteNote(id, { name: staff.name, role: staff.role });
    refresh();
  } catch (error) {
    logError("afvinklijst.notitie.weg", error);
  }
}
