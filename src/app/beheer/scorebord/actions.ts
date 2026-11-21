"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { addBonus, removeBonus, setLockAuto, setLockClosed, VERRAST_COOKIE } from "@/lib/server/scoreboard";
import { requireAdmin } from "@/lib/server/session";
import { isUuid, listTeams } from "@/lib/server/teams";
import { cookieBase } from "@/lib/server/tokens";
import { pointsToTwelfths } from "@/lib/shared/scoring";
import { parseDecimal } from "@/lib/shared/zeskamp";

export type ScorebordState = { fout?: string; gelukt?: string; velden?: Record<string, string> };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheer(): Promise<{ actor: Actor; env: "live" | "test" }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

/** Close the lock now, or open it again (the admin's override, SPEC §4.5). */
export async function zetSlot(_previous: ScorebordState, formData: FormData): Promise<ScorebordState> {
  const { actor, env } = await beheer();
  const dicht = formData.get("slot") === "dicht";
  if (!dicht && formData.get("zeker") !== "on") {
    return { fout: "Vink eerst aan dat iedereen de echte stand weer mag zien." };
  }
  try {
    const changed = await setLockClosed(env, dicht, actor);
    await ring(env);
    refresh();
    if (!changed) return { gelukt: dicht ? "Het slot zat al dicht." : "Het slot was al open." };
    return { gelukt: dicht ? "Het slot is dicht. De stand van nu is bewaard." : "Het slot is open. Iedereen ziet de echte stand." };
  } catch (error) {
    logError("beheer.slot", error);
    return { fout: ONZE_KANT };
  }
}

export async function zetSlotAutomatisch(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  try {
    await setLockAuto(env, formData.get("waarde") === "1", actor);
    await ring(env);
    refresh();
  } catch (error) {
    logError("beheer.slot.automatisch", error);
  }
}

/** "Ik wil zelf ook verrast worden": per device, so it is a cookie. */
export async function zetVerrast(formData: FormData): Promise<void> {
  await requireAdmin();
  const store = await cookies();
  if (formData.get("waarde") === "1") store.set(VERRAST_COOKIE, "1", cookieBase(60 * 24 * 60 * 60));
  else store.delete(VERRAST_COOKIE);
  refresh();
}

/** Bonus points, plus or minus, always with a reason. */
export async function geefPunten(_previous: ScorebordState, formData: FormData): Promise<ScorebordState> {
  const { actor, env } = await beheer();
  const teamId = String(formData.get("team") ?? "");
  const text = String(formData.get("punten") ?? "");
  const reason = String(formData.get("reden") ?? "").replace(/\s+/g, " ").trim();
  const velden: Record<string, string> = {};
  const points = parseDecimal(text);
  const twelfths = points === null ? 0 : pointsToTwelfths(points);
  const teams = await listTeams(env);
  if (!isUuid(teamId) || !teams.some((team) => team.id === teamId)) velden.team = "Kies een team.";
  if (points === null) velden.punten = "Typ een getal, bijvoorbeeld 2 of -1,5.";
  else if (twelfths === 0) velden.punten = "Nul punten geven heeft geen zin.";
  else if (Math.abs(points) > 100) velden.punten = "Houd het tussen -100 en 100.";
  if (!reason) velden.reden = "Schrijf erbij waarom. Dat ziet iedereen in de opbouw.";
  if (reason.length > 200) velden.reden = "Houd de reden korter dan 200 tekens.";
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    await addBonus(env, { teamId, twelfths, reason }, actor);
    await ring(env);
    refresh();
    const team = teams.find((t) => t.id === teamId)?.name ?? "het team";
    return { gelukt: twelfths > 0 ? `Punten gegeven aan ${team}.` : `Punten afgetrokken van ${team}.` };
  } catch (error) {
    logError("beheer.punten", error);
    return { fout: ONZE_KANT };
  }
}

export async function draaiPuntenTerug(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    if (await removeBonus(env, id, actor)) await ring(env);
    refresh();
  } catch (error) {
    logError("beheer.punten.terug", error);
  }
}
