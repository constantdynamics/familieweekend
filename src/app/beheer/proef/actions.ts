"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/lib/server/audit";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { emptyTestEnvironment, setUpTestEnvironment, type ProefPin } from "@/lib/server/proef";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";
import {
  BEKIJK_COOKIE,
  CAPTAIN_COOKIE,
  PROEF_COOKIE,
  PROEF_MAX_AGE_S,
  cookieBase,
  createProefToken,
  createViewAsToken,
  type ViewAs,
} from "@/lib/server/tokens";

export type ProefState = { fout?: string; gelukt?: string; pins?: ProefPin[]; link?: string };

async function beheerder(): Promise<Actor> {
  const staff = await requireAdmin();
  return { id: staff.staffId, name: staff.name, role: staff.role };
}

/** Fresh test teams, names and events; the new team PINs are shown once. */
export async function zetProefKlaar(): Promise<ProefState> {
  const actor = await beheerder();
  try {
    const pins = await setUpTestEnvironment(actor);
    await ring("test");
    refresh();
    return { pins, gelukt: "De proef staat klaar, met vier proefteams en twaalf testnamen." };
  } catch (error) {
    logError("proef.klaarzetten", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." };
  }
}

export async function maakProefLeeg(): Promise<ProefState> {
  const actor = await beheerder();
  try {
    await emptyTestEnvironment(actor);
    await ring("test");
    refresh();
    return { gelukt: "De proef is leeg. De echte Spelen zijn niet aangeraakt." };
  } catch (error) {
    logError("proef.leegmaken", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." };
  }
}

/** This device enters the test environment for at most a day. */
export async function gaDeProefIn(): Promise<void> {
  await beheerder();
  const store = await cookies();
  store.set(PROEF_COOKIE, await createProefToken("proef"), cookieBase(PROEF_MAX_AGE_S));
  store.delete(CAPTAIN_COOKIE);
  redirect("/beheer/proef");
}

export async function verlaatDeProef(): Promise<void> {
  const store = await cookies();
  store.delete(PROEF_COOKIE);
  store.delete(BEKIJK_COOKIE);
  store.delete(CAPTAIN_COOKIE);
  redirect("/");
}

/** A link that brings another phone into the test environment (valid for a day). */
export async function maakUitnodiging(): Promise<ProefState> {
  await beheerder();
  const host = (await headers()).get("host") ?? "valkenburger-spelen.vercel.app";
  const scheme = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const token = await createProefToken("uitnodiging");
  return { link: `${scheme}://${host}/proef/${token}` };
}

/** "Bekijk als…": only in the test environment. */
export async function bekijkAls(formData: FormData): Promise<void> {
  await beheerder();
  const rol = String(formData.get("rol") ?? "");
  const team = String(formData.get("team") ?? "");
  const deelnemer = String(formData.get("deelnemer") ?? "");
  let view: ViewAs | null = null;
  if (rol === "familie") view = { role: "familie", participantId: isUuid(deelnemer) ? deelnemer : null };
  if (rol === "captain" && isUuid(team)) view = { role: "captain", teamId: team };
  if (rol === "meekijker" && isUuid(team)) view = { role: "meekijker", teamId: team, participantId: isUuid(deelnemer) ? deelnemer : null };
  if (rol === "spelleider") view = { role: "spelleider" };
  if (!view) redirect("/beheer/proef");
  const store = await cookies();
  store.set(BEKIJK_COOKIE, await createViewAsToken(view), cookieBase(PROEF_MAX_AGE_S));
  redirect(view.role === "spelleider" ? "/spelleider" : "/");
}

export async function stopBekijken(): Promise<void> {
  const store = await cookies();
  store.delete(BEKIJK_COOKIE);
  redirect("/beheer/proef");
}
