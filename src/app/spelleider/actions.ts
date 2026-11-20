"use server";

import { redirect } from "next/navigation";
import { findStaffByPin } from "@/lib/server/access";
import { logAudit } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import { tryPin } from "@/lib/server/pin-login";
import { endStaffSession, getFamilySession, getStaffSession, startStaffSession } from "@/lib/server/session";
import { normalizePin } from "@/lib/shared/codes";

export type SpelleiderState = { fout?: string };

export async function logInSpelleider(_previous: SpelleiderState, formData: FormData): Promise<SpelleiderState> {
  const pin = normalizePin(formData.get("pin"));
  if (!pin) return { fout: "Vul je PIN in." };
  const family = await getFamilySession();
  if (!family) redirect("/welkom?terug=/spelleider");
  try {
    const result = await tryPin("pin:spelleider", family.deviceId, () =>
      /^\d{4,8}$/.test(pin) ? findStaffByPin("spelleider", pin) : Promise.resolve(null),
    );
    if ("fout" in result) return { fout: result.fout };
    const match = result.ok;
    await startStaffSession({
      staffId: match.id,
      role: match.role,
      name: match.name,
      deviceId: family.deviceId,
      pinVersion: match.pinVersion,
    });
    await logAudit({ id: match.id, name: match.name, role: match.role }, { action: "beheer.ingelogd" });
  } catch (error) {
    logError("spelleider.inloggen", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." };
  }
  redirect("/spelleider");
}

export async function logUitSpelleider(): Promise<void> {
  const staff = await getStaffSession();
  if (staff) {
    try {
      await logAudit({ id: staff.staffId, name: staff.name, role: staff.role }, { action: "beheer.uitgelogd" });
    } catch (error) {
      logError("spelleider.uitloggen", error);
    }
  }
  await endStaffSession();
  redirect("/");
}
