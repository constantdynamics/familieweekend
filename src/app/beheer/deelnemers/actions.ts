"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { addSpelleider, resetSpelleiderPin, stopSpelleider } from "@/lib/server/access";
import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import {
  addParticipant,
  deleteParticipant,
  importParticipants,
  parseNameList,
  releaseParticipant,
  updateParticipant,
} from "@/lib/server/participants";
import { generatePin } from "@/lib/server/pins";
import { requireAdmin } from "@/lib/server/session";
import { SETTINGS_TAG, setSettingsFlag } from "@/lib/server/settings";
import { isUuid, listTeams, setTeamPin, TEAM_COLORS, updateTeam, type TeamColor } from "@/lib/server/teams";

export type BeheerState = {
  fout?: string;
  gelukt?: string;
  /** A new PIN, shown exactly once. */
  pin?: string;
  velden?: Record<string, string>;
};

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheer(): Promise<{ actor: Actor; env: "live" | "test" }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").replace(/\s+/g, " ").trim();
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

/* Plak een lijst met namen. */
export async function plakDeelnemers(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const names = parseNameList(String(formData.get("namen") ?? ""));
  const team = String(formData.get("team") ?? "");
  if (names.length === 0) return { fout: "Plak eerst een paar namen, één per regel." };
  if (names.length > 200) return { fout: "Dat zijn er meer dan 200. Plak ze in delen." };
  try {
    const teamId = isUuid(team) ? team : null;
    const { added, skipped } = await importParticipants(env, names, teamId, actor);
    await ring(env);
    refresh();
    const parts = [
      added.length === 1 ? "1 naam toegevoegd." : `${added.length} namen toegevoegd.`,
      skipped.length > 0 ? `Al in de lijst: ${skipped.join(", ")}.` : "",
    ];
    return { gelukt: parts.filter(Boolean).join(" ") };
  } catch (error) {
    logError("beheer.deelnemers.plakken", error);
    return { fout: ONZE_KANT };
  }
}

/* Teamnaam, kleur en volgorde. */
export async function bewaarTeam(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  const name = text(formData, "naam");
  const color = String(formData.get("kleur") ?? "") as TeamColor;
  const sort = Number(formData.get("volgorde"));
  const velden: Record<string, string> = {};
  if (!name) velden.naam = "Geef het team een naam.";
  if (name.length > 40) velden.naam = "Houd de naam korter dan 40 tekens.";
  if (!TEAM_COLORS.includes(color)) velden.kleur = "Kies een van de vier kleuren.";
  if (!Number.isInteger(sort) || sort < 1 || sort > 20) velden.volgorde = "Kies een volgorde van 1 tot 20.";
  if (!isUuid(id)) return { fout: "Dit team bestaat niet meer." };
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    await updateTeam(env, id, { name, color, sort }, actor);
    await ring(env);
    refresh();
    return { gelukt: "Team bewaard." };
  } catch (error) {
    if (isDuplicate(error)) return { fout: "Er is al een team met die naam.", velden: { naam: "Kies een andere naam." } };
    logError("beheer.team", error);
    return { fout: ONZE_KANT };
  }
}

/* Nieuwe team-PIN voor de captain. */
export async function maakTeamPin(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { fout: "Dit team bestaat niet meer." };
  try {
    const pin = generatePin();
    await setTeamPin(env, id, pin, actor);
    await ring(env);
    refresh();
    return { pin, gelukt: "Nieuwe team-PIN gemaakt. Het oude captaintoestel is uitgelogd." };
  } catch (error) {
    logError("beheer.teampin", error);
    return { fout: ONZE_KANT };
  }
}

/* Mag iedereen zien in welk team hij zit? */
export async function zetTeamsZichtbaar(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  try {
    await setSettingsFlag("teamsVisible", formData.get("waarde") === "1", actor);
    updateTag(SETTINGS_TAG);
    await ring(env);
    refresh();
  } catch (error) {
    logError("beheer.teams.zichtbaar", error);
  }
}

/* Eén deelnemer toevoegen of wijzigen. */
export async function bewaarDeelnemer(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  const name = text(formData, "naam");
  const nickname = text(formData, "roepnaam") || null;
  const team = String(formData.get("team") ?? "");
  const velden: Record<string, string> = {};
  if (!name) velden.naam = "Vul een naam in.";
  if (name.length > 60) velden.naam = "Houd de naam korter dan 60 tekens.";
  if (nickname && nickname.length > 30) velden.roepnaam = "Houd de roepnaam korter dan 30 tekens.";
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };

  const teams = await listTeams(env);
  const teamId = teams.some((t) => t.id === team) ? team : null;
  const input = {
    name,
    nickname,
    teamId,
    isChild: formData.get("kind") === "on",
    isCaptain: formData.get("captain") === "on",
  };
  try {
    if (isUuid(id)) await updateParticipant(env, id, input, actor);
    else await addParticipant(env, input, actor);
    await ring(env);
  } catch (error) {
    if (isDuplicate(error)) {
      return { fout: "Deze naam staat al in de lijst. Elke naam mag maar één keer voorkomen.", velden: { naam: "Maak de naam uniek, bijvoorbeeld met een achternaam." } };
    }
    logError("beheer.deelnemer", error);
    return { fout: ONZE_KANT };
  }
  redirect("/beheer/deelnemers#deelnemers");
}

export async function verwijderDeelnemer(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (isUuid(id)) {
    try {
      await deleteParticipant(env, id, actor);
      await ring(env);
    } catch (error) {
      logError("beheer.deelnemer.verwijderen", error);
    }
  }
  redirect("/beheer/deelnemers#deelnemers");
}

export async function geefNaamVrij(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    await releaseParticipant(env, id, actor);
    await ring(env);
    refresh();
  } catch (error) {
    logError("beheer.naam.vrijgeven", error);
  }
}

/* Spelleiders. */
export async function voegSpelleiderToe(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor } = await beheer();
  const name = text(formData, "naam");
  if (!name) return { fout: "Vul de naam van de spelleider in.", velden: { naam: "Vul een naam in." } };
  if (name.length > 60) return { fout: "Houd de naam korter dan 60 tekens.", velden: { naam: "Te lang." } };
  try {
    const pin = generatePin();
    await addSpelleider(name, pin, actor);
    refresh();
    return { pin, gelukt: `${name} is spelleider.` };
  } catch (error) {
    logError("beheer.spelleider", error);
    return { fout: ONZE_KANT };
  }
}

export async function nieuweSpelleiderPin(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { fout: "Deze spelleider bestaat niet meer." };
  try {
    const pin = generatePin();
    const name = await resetSpelleiderPin(id, pin, actor);
    refresh();
    return { pin, gelukt: `Nieuwe PIN voor ${name}. De oude werkt niet meer.` };
  } catch (error) {
    logError("beheer.spelleider.pin", error);
    return { fout: ONZE_KANT };
  }
}

export async function stopSpelleiderActie(formData: FormData): Promise<void> {
  const { actor } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  try {
    await stopSpelleider(id, actor);
    refresh();
  } catch (error) {
    logError("beheer.spelleider.stop", error);
  }
}
