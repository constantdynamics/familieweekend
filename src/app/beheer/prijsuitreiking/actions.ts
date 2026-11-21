"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ceremonyAction, type CeremonyAction } from "@/lib/server/ceremony";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { requireAdmin } from "@/lib/server/session";

export type CeremonieState = { fout?: string };

const ACTIES: readonly CeremonyAction[] = ["start", "volgende", "terug", "stop"];

/**
 * Start the ceremony (every phone goes to /ceremonie), or tap a step from
 * here. The steps themselves are tapped on the ceremony screen too.
 */
export async function ceremonieActie(_previous: CeremonieState, formData: FormData): Promise<CeremonieState> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  const actie = ACTIES.find((candidate) => candidate === formData.get("actie"));
  if (!actie) return { fout: "Onbekende stap." };
  const stap = Number(formData.get("stap"));
  try {
    const outcome = await ceremonyAction(
      ctx.env,
      actie,
      { id: staff.staffId, name: staff.name, role: staff.role },
      Number.isInteger(stap) && formData.has("stap") ? stap : null,
    );
    if (!outcome.ok && !outcome.conflict) return { fout: outcome.fout };
    if (outcome.ok) await ring(ctx.env);
  } catch (error) {
    logError("beheer.ceremonie", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het zo opnieuw." };
  }
  if (actie === "start") redirect("/ceremonie");
  refresh();
  return {};
}
