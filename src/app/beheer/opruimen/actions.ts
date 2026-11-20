"use server";

import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { cleanUpAfterWeekend } from "@/lib/server/proef";
import { requireAdmin } from "@/lib/server/session";

export type OpruimState = { fout?: string; gelukt?: string };

export async function ruimAllesOp(_previous: OpruimState, formData: FormData): Promise<OpruimState> {
  const staff = await requireAdmin();
  if (String(formData.get("bevestiging") ?? "").trim().toUpperCase() !== "OPRUIMEN") {
    return { fout: "Typ OPRUIMEN in hoofdletters om te bevestigen." };
  }
  try {
    const result = await cleanUpAfterWeekend({ id: staff.staffId, name: staff.name, role: staff.role });
    await ring("live");
    return {
      gelukt: `Opgeruimd: ${result.answers} antwoorden, ${result.photos} foto's en ${result.links} naamkoppelingen. Het prikbord staat er nog.`,
    };
  } catch (error) {
    logError("beheer.opruimen", error);
    return { fout: "Er ging iets mis aan onze kant. Er is niets verwijderd. Probeer het over een minuut opnieuw." };
  }
}
