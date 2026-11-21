"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { requireAdmin } from "@/lib/server/session";
import { SETTINGS_TAG } from "@/lib/server/settings";
import { isUuid, listTeams } from "@/lib/server/teams";
import {
  addGame,
  correctResults,
  deleteGame,
  getGame,
  resetGame,
  saveVrijdagPoints,
  setZeskampJoker,
  setZeskampPointsTable,
  updateGame,
  type GameInput,
} from "@/lib/server/zeskamp";
import { pointsToTwelfths } from "@/lib/shared/scoring";
import { isGameMode, isResultType, parseDecimal, parseStopwatch } from "@/lib/shared/zeskamp";

export type ZeskampState = { fout?: string; gelukt?: string; velden?: Record<string, string> };

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheer(): Promise<{ actor: Actor; env: "live" | "test" }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").replace(/\s+/g, " ").trim();
}

function leesSpel(formData: FormData): { input: GameInput | null; velden: Record<string, string> } {
  const name = text(formData, "naam");
  const description = text(formData, "uitleg") || null;
  const sort = Number(formData.get("volgorde"));
  const resultType = String(formData.get("uitslagtype") ?? "");
  const unit = text(formData, "eenheid") || null;
  const mode = String(formData.get("modus") ?? "");
  const velden: Record<string, string> = {};
  if (!name) velden.naam = "Geef het spel een naam.";
  if (name.length > 60) velden.naam = "Houd de naam korter dan 60 tekens.";
  if (description && description.length > 300) velden.uitleg = "Houd de uitleg korter dan 300 tekens.";
  if (!Number.isInteger(sort) || sort < 1 || sort > 99) velden.volgorde = "Kies een volgorde van 1 tot 99.";
  if (!isResultType(resultType)) velden.uitslagtype = "Kies hoe het spel beslist wordt.";
  if (unit && unit.length > 20) velden.eenheid = "Houd de eenheid kort, bijvoorbeeld cm.";
  if (!isGameMode(mode)) velden.modus = "Kies tegelijk of na elkaar.";
  if (Object.keys(velden).length > 0 || !isResultType(resultType) || !isGameMode(mode)) return { input: null, velden };
  return {
    input: { name, description, sort, resultType, unit, mode, jokerAllowed: formData.get("joker") === "on" },
    velden,
  };
}

export async function voegSpelToe(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const { input, velden } = leesSpel(formData);
  if (!input) return { fout: "Kijk even bij de rode tekst.", velden };
  let id: string;
  try {
    id = await addGame(env, input, actor);
    await ring(env);
  } catch (error) {
    logError("beheer.spel.toevoegen", error);
    return { fout: ONZE_KANT };
  }
  redirect(`/beheer/zeskamp/${id}`);
}

export async function bewaarSpel(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  const { input, velden } = leesSpel(formData);
  if (!input) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    const outcome = await updateGame(env, id, input, actor);
    if (outcome === "onbekend") return { fout: "Dit spel bestaat niet meer." };
    if (outcome === "type-vast") {
      return {
        fout: "Dit spel heeft al een uitslag. Zet het eerst terug naar gepland als je het uitslagtype wilt veranderen.",
        velden: { uitslagtype: "Vast zolang er een uitslag is." },
      };
    }
    await ring(env);
    refresh();
    return { gelukt: "Spel bewaard." };
  } catch (error) {
    logError("beheer.spel.bewaren", error);
    return { fout: ONZE_KANT };
  }
}

export async function verwijderSpel(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (formData.get("zeker") !== "on") return { fout: "Vink eerst aan dat je dit spel echt wilt verwijderen." };
  try {
    const outcome = await deleteGame(env, id, actor);
    if (outcome === "heeft-uitslag") return { fout: "Dit spel is al gespeeld. Zet het eerst terug naar gepland." };
    await ring(env);
  } catch (error) {
    logError("beheer.spel.verwijderen", error);
    return { fout: ONZE_KANT };
  }
  redirect("/beheer/zeskamp");
}

/** Back to "gepland": for a game started by mistake. The result stays in the logbook. */
export async function zetSpelTerug(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (formData.get("zeker") !== "on") return { fout: "Vink eerst aan dat de uitslag weg mag." };
  try {
    if (!(await resetGame(env, id, actor))) return { fout: "Dit spel bestaat niet meer." };
    await ring(env);
    refresh();
    return { gelukt: "Het spel staat weer op gepland. De oude uitslag staat in het logboek." };
  } catch (error) {
    logError("beheer.spel.terugzetten", error);
    return { fout: ONZE_KANT };
  }
}

/** The admin corrects a result: per team a value, empty for none. */
export async function bewaarUitslag(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  const game = await getGame(env, id);
  if (!game) return { fout: "Dit spel bestaat niet meer." };
  if (!isResultType(game.resultType)) return { fout: "Geef het spel eerst een uitslagtype." };
  const teams = await listTeams(env);
  const values: Record<string, number | null> = {};
  const velden: Record<string, string> = {};
  for (const team of teams) {
    const raw = String(formData.get(`waarde-${team.id}`) ?? "").trim();
    if (!raw) {
      values[team.id] = null;
      continue;
    }
    const value = game.resultType === "tijd" ? parseStopwatch(raw) : parseDecimal(raw);
    if (value === null) {
      velden[team.id] = game.resultType === "tijd" ? "Typ een tijd, bijvoorbeeld 1:02,34." : "Typ een getal.";
      continue;
    }
    values[team.id] = value;
  }
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    const outcome = await correctResults(env, id, values, actor);
    if (!outcome.ok) return { fout: outcome.fout };
    if (!outcome.changed) return { gelukt: "Er was niets veranderd." };
    await ring(env);
    refresh();
    return { gelukt: "Uitslag bewaard. De oude waarden staan in het logboek." };
  } catch (error) {
    logError("beheer.uitslag", error);
    return { fout: ONZE_KANT };
  }
}

/** The admin puts a team's zeskamp joker on this game, or takes it away. */
export async function zetJokerBeheer(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const teamId = String(formData.get("team") ?? "");
  const gameId = String(formData.get("spel") ?? "");
  if (!isUuid(teamId)) return { fout: "Kies een team." };
  try {
    const outcome = await setZeskampJoker(env, teamId, isUuid(gameId) ? gameId : null, actor, { asAdmin: true });
    if (!outcome.ok) return { fout: outcome.fout };
    await ring(env);
    refresh();
    return { gelukt: outcome.melding };
  } catch (error) {
    logError("beheer.joker", error);
    return { fout: ONZE_KANT };
  }
}

/** Vrijdag: free points per team (SPEC §4.8). Empty clears a team. */
export async function bewaarVrijdag(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor, env } = await beheer();
  const teams = await listTeams(env);
  const points: Record<string, number | null> = {};
  const velden: Record<string, string> = {};
  for (const team of teams) {
    const raw = String(formData.get(`punten-${team.id}`) ?? "").trim();
    if (!raw) {
      points[team.id] = null;
      continue;
    }
    const value = parseDecimal(raw);
    if (value === null || Math.abs(value) > 1000) {
      velden[team.id] = "Typ een getal, bijvoorbeeld 8 of 7,5.";
      continue;
    }
    points[team.id] = pointsToTwelfths(value);
  }
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    const changed = await saveVrijdagPoints(env, points, actor);
    if (!changed) return { gelukt: "Er was niets veranderd." };
    await ring(env);
    refresh();
    return { gelukt: "Punten van vrijdag bewaard." };
  } catch (error) {
    logError("beheer.vrijdag", error);
    return { fout: ONZE_KANT };
  }
}

/** Place points of the zeskamp, "10, 7, 5, 3" (SPEC §5.1: all tables are adjustable). */
export async function bewaarPuntentabel(_previous: ZeskampState, formData: FormData): Promise<ZeskampState> {
  const { actor } = await beheer();
  const parts = String(formData.get("tabel") ?? "")
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number);
  const ok =
    parts.length >= 1 &&
    parts.length <= 8 &&
    parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 100) &&
    parts.every((value, index) => index === 0 || value <= parts[index - 1]);
  if (!ok) {
    return {
      fout: "Kijk even bij de rode tekst.",
      velden: { tabel: "Hele getallen van hoog naar laag, met komma's ertussen. Bijvoorbeeld 10, 7, 5, 3." },
    };
  }
  try {
    await setZeskampPointsTable(parts, actor);
    updateTag(SETTINGS_TAG);
    await ring("live");
    await ring("test");
    refresh();
    return { gelukt: "Puntentabel bewaard. Alle spellen rekenen er meteen mee." };
  } catch (error) {
    logError("beheer.puntentabel", error);
    return { fout: ONZE_KANT };
  }
}
