"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import {
  addProgramItem,
  deleteProgramItem,
  moveProgramItem,
  ringProgram,
  updateProgramItem,
} from "@/lib/server/program";
import { requireAdmin } from "@/lib/server/session";
import { SETTINGS_TAG, setSettingsFlag } from "@/lib/server/settings";
import { isUuid } from "@/lib/server/teams";
import { dayKey, parseProgramForm, type ProgramFormValues } from "@/lib/shared/program";

export type ProgrammaState = {
  fout?: string;
  gelukt?: string;
  velden?: Partial<Record<keyof ProgramFormValues, string>>;
  waarden?: Partial<ProgramFormValues>;
};

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheerder(): Promise<Actor> {
  const staff = await requireAdmin();
  return { id: staff.staffId, name: staff.name, role: staff.role };
}

function waardenUit(formData: FormData): ProgramFormValues {
  const get = (key: string) => String(formData.get(key) ?? "");
  return {
    dag: get("dag"),
    begin: get("begin"),
    eind: get("eind"),
    titel: get("titel"),
    ondertitel: get("ondertitel"),
    plek: get("plek"),
    soort: get("soort"),
  };
}

/* Een onderdeel toevoegen; het formulier blijft staan voor het volgende. */
export async function voegOnderdeelToe(_previous: ProgrammaState, formData: FormData): Promise<ProgrammaState> {
  const actor = await beheerder();
  const waarden = waardenUit(formData);
  const result = parseProgramForm(waarden);
  if (!result.ok) return { fout: "Niet alles is goed ingevuld. Kijk bij de rode tekst.", velden: result.velden, waarden };
  try {
    await addProgramItem(result.input, actor);
    await ringProgram();
    refresh();
    // Keep the day and the kind for the next item; the rest starts empty.
    return {
      gelukt: `Onderdeel toegevoegd: ${result.input.title}.`,
      waarden: { dag: waarden.dag, soort: waarden.soort },
    };
  } catch (error) {
    logError("beheer.programma.toevoegen", error);
    return { fout: ONZE_KANT, waarden };
  }
}

/* Een onderdeel wijzigen; daarna terug naar de lijst. */
export async function bewaarOnderdeel(_previous: ProgrammaState, formData: FormData): Promise<ProgrammaState> {
  const actor = await beheerder();
  const id = String(formData.get("id") ?? "");
  const waarden = waardenUit(formData);
  if (!isUuid(id)) return { fout: "Dit onderdeel bestaat niet meer." };
  const result = parseProgramForm(waarden);
  if (!result.ok) return { fout: "Niet alles is goed ingevuld. Kijk bij de rode tekst.", velden: result.velden, waarden };
  try {
    const found = await updateProgramItem(id, result.input, actor);
    if (!found) return { fout: "Dit onderdeel bestaat niet meer. Ververs de pagina." };
    await ringProgram();
  } catch (error) {
    logError("beheer.programma.bewaren", error);
    return { fout: ONZE_KANT, waarden };
  }
  redirect(`/beheer/programma?klaar=bewaard#dag-${dayKey(result.input.startsAt)}`);
}

export async function verwijderOnderdeel(formData: FormData): Promise<void> {
  const actor = await beheerder();
  const id = String(formData.get("id") ?? "");
  const dag = String(formData.get("dag") ?? "");
  if (isUuid(id)) {
    try {
      await deleteProgramItem(id, actor);
      await ringProgram();
    } catch (error) {
      logError("beheer.programma.verwijderen", error);
    }
  }
  redirect(`/beheer/programma?klaar=verwijderd${/^\d{4}-\d{2}-\d{2}$/.test(dag) ? `#dag-${dag}` : ""}`);
}

/* Omhoog of omlaag, alleen tussen onderdelen die tegelijk beginnen. */
export async function verplaatsOnderdeel(formData: FormData): Promise<void> {
  const actor = await beheerder();
  const id = String(formData.get("id") ?? "");
  const richting = formData.get("richting") === "omhoog" ? "omhoog" : "omlaag";
  if (!isUuid(id)) return;
  try {
    if (await moveProgramItem(id, richting, actor)) {
      await ringProgram();
      refresh();
    }
  } catch (error) {
    logError("beheer.programma.verplaatsen", error);
  }
}

/* Mag de familie het programma zien? */
export async function zetProgrammaZichtbaar(formData: FormData): Promise<void> {
  const actor = await beheerder();
  try {
    await setSettingsFlag("programVisible", formData.get("waarde") === "1", actor);
    updateTag(SETTINGS_TAG);
    await ringProgram();
    refresh();
  } catch (error) {
    logError("beheer.programma.zichtbaar", error);
  }
}
