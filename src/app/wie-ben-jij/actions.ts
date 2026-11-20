"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { claimParticipant, unclaimOwn } from "@/lib/server/participants";
import { safeReturnPath } from "@/lib/shared/paths";

export type NaamState = { fout?: string; gekozen?: string };

/** Link a name to this device. A name belongs to one device only. */
export async function kiesNaam(_previous: NaamState, formData: FormData): Promise<NaamState> {
  const ctx = await getActionContext();
  if (!ctx.deviceId) redirect("/welkom?terug=/wie-ben-jij");
  if (ctx.viewAs) return { fout: "Je bekijkt de app als iemand anders. Stop eerst met bekijken." };
  const id = String(formData.get("id") ?? "");
  const naam = String(formData.get("naam") ?? "");
  try {
    const result = await claimParticipant(ctx.env, id, ctx.deviceId);
    if (result === "bezet") {
      return {
        fout: `${naam} is al in gebruik op een ander toestel. Klopt dat niet? Vraag de beheerder om de naam vrij te geven.`,
      };
    }
    if (result === "onbekend") return { fout: "Deze naam staat niet meer in de lijst. Ververs de pagina." };
    await ring(ctx.env);
    refresh();
    return { gekozen: naam };
  } catch (error) {
    logError("naam.kiezen", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." };
  }
}

export async function laatNaamLos(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if (!ctx.deviceId || ctx.viewAs) return;
  try {
    await unclaimOwn(ctx.env, String(formData.get("id") ?? ""), ctx.deviceId);
    await ring(ctx.env);
    refresh();
  } catch (error) {
    logError("naam.loslaten", error);
  }
}

export async function klaar(formData: FormData): Promise<void> {
  redirect(safeReturnPath(formData.get("terug")));
}
