"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { changeStaffPin, findStaffByPin, setFamilyCode, verifyStaffPin } from "@/lib/server/access";
import { logAudit, type Actor } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import { checkLimit, LIMITS, networkSubject, recordAttempt } from "@/lib/server/rate-limit";
import {
  endStaffSession,
  getFamilySession,
  requireAdmin,
  startStaffSession,
  type StaffSession,
} from "@/lib/server/session";
import { ring } from "@/lib/server/live";
import { SETTINGS_TAG, setSettingsFlag, updateSettings } from "@/lib/server/settings";
import { familyCodeProblem, normalizeFamilyCode, normalizePin, pinProblem } from "@/lib/shared/codes";
import { formatTime, parseAmsterdamInput } from "@/lib/shared/time";

export type FormState = {
  fout?: string;
  gelukt?: string;
  velden?: Record<string, string>;
  waarden?: Record<string, string>;
};

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

function actorFrom(staff: StaffSession): Actor {
  return { id: staff.staffId, name: staff.name, role: staff.role };
}

/* Inloggen met de PIN van de beheerder. */
export async function logIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const pin = normalizePin(formData.get("pin"));
  if (!pin) return { fout: "Vul je PIN in." };

  const family = await getFamilySession();
  if (!family) redirect("/welkom?terug=/beheer");

  try {
    const kind = "pin:beheerder" as const;
    const device = await checkLimit(kind, family.deviceId, LIMITS.pinPerDevice);
    const network = await networkSubject();
    const net = await checkLimit(kind, network, LIMITS.pinPerNetwork);
    const blocked = device.blocked ? device : net.blocked ? net : null;
    if (blocked?.retryAt) {
      return { fout: `Te veel pogingen. Probeer het om ${formatTime(blocked.retryAt)} opnieuw.` };
    }
    const match = /^\d{4,8}$/.test(pin) ? await findStaffByPin("beheerder", pin) : null;
    await recordAttempt(kind, family.deviceId, Boolean(match));
    await recordAttempt(kind, network, Boolean(match));
    if (!match) {
      const left = Math.min(device.remaining, net.remaining) - 1;
      return {
        fout:
          left > 0
            ? `Die PIN klopt niet. Je kunt het nog ${left} keer proberen.`
            : "Die PIN klopt niet. Wacht nu tien minuten voor je het opnieuw probeert.",
      };
    }
    await startStaffSession({
      staffId: match.id,
      role: match.role,
      name: match.name,
      deviceId: family.deviceId,
      pinVersion: match.pinVersion,
    });
    await logAudit({ id: match.id, name: match.name, role: match.role }, { action: "beheer.ingelogd" });
  } catch (error) {
    logError("beheer.inloggen", error);
    return { fout: ONZE_KANT };
  }
  redirect("/beheer");
}

export async function logUit(): Promise<void> {
  const staff = await requireAdmin();
  try {
    await logAudit(actorFrom(staff), { action: "beheer.uitgelogd" });
  } catch (error) {
    logError("beheer.uitloggen", error);
  }
  await endStaffSession();
  redirect("/beheer");
}

/* Instellingen: aftrap, einde, locatie, opening en deadline van de fun facts. */
export async function bewaarInstellingen(_previous: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireAdmin();
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const waarden: Record<string, string> = {};
  for (const key of [
    "start_datum", "start_tijd", "eind_datum", "eind_tijd", "locatie", "plaats",
    "breedtegraad", "lengtegraad", "deadline_datum", "deadline_tijd", "open_datum", "open_tijd",
  ]) {
    waarden[key] = get(key);
  }

  const velden: Record<string, string> = {};
  const startAt = parseAmsterdamInput(waarden.start_datum, waarden.start_tijd);
  const endAt = parseAmsterdamInput(waarden.eind_datum, waarden.eind_tijd);
  const deadline = parseAmsterdamInput(waarden.deadline_datum, waarden.deadline_tijd);
  if (!startAt) velden.start = "Vul een geldige datum en tijd in.";
  if (!endAt) velden.eind = "Vul een geldige datum en tijd in.";
  if (startAt && endAt && endAt <= startAt) velden.eind = "Het einde moet na de aftrap liggen.";
  if (!deadline) velden.deadline = "Vul een geldige datum en tijd in.";
  const openAt = parseAmsterdamInput(waarden.open_datum, waarden.open_tijd);
  if (!openAt) velden.open = "Vul een geldige datum en tijd in.";
  if (openAt && deadline && deadline <= openAt) velden.deadline = "De deadline moet na de opening liggen.";
  if (!waarden.locatie) velden.locatie = "Vul de naam van de locatie in.";
  if (waarden.locatie.length > 80) velden.locatie = "Houd de naam korter dan 80 tekens.";
  if (!waarden.plaats) velden.plaats = "Vul de plaats in.";
  if (waarden.plaats.length > 80) velden.plaats = "Houd de plaats korter dan 80 tekens.";
  const lat = Number(waarden.breedtegraad.replace(",", "."));
  const lng = Number(waarden.lengtegraad.replace(",", "."));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) velden.breedtegraad = "Een breedtegraad ligt tussen -90 en 90.";
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) velden.lengtegraad = "Een lengtegraad ligt tussen -180 en 180.";

  if (Object.keys(velden).length > 0 || !startAt || !endAt || !deadline || !openAt) {
    return { fout: "Niet alles is goed ingevuld. Kijk bij de rode tekst.", velden, waarden };
  }

  try {
    const changed = await updateSettings(
      {
        startAt,
        endAt,
        locationName: waarden.locatie,
        locationPlace: waarden.plaats,
        latitude: lat,
        longitude: lng,
        funfactsDeadline: deadline,
        funfactsOpenAt: openAt,
      },
      actorFrom(staff),
    );
    if (changed.length === 0) return { gelukt: "Er was niets veranderd.", waarden };
    updateTag(SETTINGS_TAG);
    return { gelukt: "Instellingen bewaard. Iedereen ziet de nieuwe stand meteen.", waarden };
  } catch (error) {
    logError("beheer.instellingen", error);
    return { fout: ONZE_KANT, waarden };
  }
}

/* Familiecode wijzigen. */
export async function wijzigFamiliecode(_previous: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireAdmin();
  const code = normalizeFamilyCode(formData.get("code"));
  const herhaal = normalizeFamilyCode(formData.get("herhaal"));
  const typed = { code: String(formData.get("code") ?? ""), herhaal: String(formData.get("herhaal") ?? "") };
  const problem = familyCodeProblem(code);
  if (problem) return { fout: problem, velden: { code: problem }, waarden: typed };
  if (code !== herhaal) {
    return { fout: "De twee codes zijn niet hetzelfde.", velden: { herhaal: "Typ dezelfde code nog een keer." }, waarden: typed };
  }
  try {
    await setFamilyCode(code, actorFrom(staff));
  } catch (error) {
    logError("beheer.familiecode", error);
    return { fout: ONZE_KANT, waarden: typed };
  }
  return { gelukt: "Familiecode gewijzigd. Wie al binnen is, blijft binnen; nieuwe telefoons gebruiken de nieuwe code." };
}

/* Eigen PIN wijzigen. */
export async function wijzigPin(_previous: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireAdmin();
  const huidig = normalizePin(formData.get("huidig"));
  const nieuw = normalizePin(formData.get("nieuw"));
  const herhaal = normalizePin(formData.get("herhaal"));
  const problem = pinProblem(nieuw);
  if (problem) return { fout: problem, velden: { nieuw: problem } };
  if (nieuw !== herhaal) return { fout: "De twee nieuwe PIN's zijn niet hetzelfde.", velden: { herhaal: "Typ dezelfde PIN nog een keer." } };

  try {
    const kind = "pin:beheerder" as const;
    const limit = await checkLimit(kind, staff.deviceId, LIMITS.pinPerDevice);
    if (limit.blocked && limit.retryAt) {
      return { fout: `Te veel pogingen. Probeer het om ${formatTime(limit.retryAt)} opnieuw.` };
    }
    const ok = await verifyStaffPin(staff.staffId, huidig);
    await recordAttempt(kind, staff.deviceId, ok);
    if (!ok) return { fout: "Je huidige PIN klopt niet.", velden: { huidig: "Deze PIN klopt niet." } };
    if (huidig === nieuw) return { fout: "Kies een andere PIN dan je huidige.", velden: { nieuw: "Kies een andere PIN." } };
    const pinVersion = await changeStaffPin(staff.staffId, nieuw, actorFrom(staff));
    // Stay logged in on this phone; other phones with the old PIN are logged out.
    await startStaffSession({ ...staff, pinVersion });
  } catch (error) {
    logError("beheer.pin", error);
    return { fout: ONZE_KANT };
  }
  return { gelukt: "PIN gewijzigd. Op andere telefoons log je opnieuw in met je nieuwe PIN." };
}

/* De nieuwe app (menu met Prikbord, fun facts, …) aan of uit voor de familie. */
export async function zetNieuweApp(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  try {
    await setSettingsFlag("fase2Live", formData.get("waarde") === "1", actorFrom(staff));
    updateTag(SETTINGS_TAG);
    await ring("live");
    refresh();
  } catch (error) {
    logError("beheer.nieuwe-app", error);
  }
}
