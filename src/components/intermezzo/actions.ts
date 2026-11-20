"use server";

import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import {
  choose,
  chooseWinnerInRealLife,
  drawNext,
  playInRealLife,
  redraw,
  stopIntermezzo,
  type IntermezzoResult,
} from "@/lib/server/intermezzo";
import { logError } from "@/lib/server/log";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";

const ONZE_KANT: IntermezzoResult = { fout: "Er ging iets mis aan onze kant. Probeer het nog eens." };

async function quizmaster(): Promise<{ actor: Actor; env: "live" | "test" }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

/** A drawn player's secret choice, from their own phone. */
export async function kies(participantId: string, keuze: string): Promise<IntermezzoResult> {
  const ctx = await getActionContext();
  if (!ctx.deviceId || ctx.viewAs) return { fout: "Je bekijkt de app als iemand anders." };
  if (!isUuid(participantId)) return { fout: "Dit is niet jouw duel." };
  try {
    return await choose(
      ctx.env,
      participantId,
      keuze,
      ctx.names.map((n) => n.id),
    );
  } catch (error) {
    logError("intermezzo.kiezen", error);
    return ONZE_KANT;
  }
}

export async function loot(): Promise<IntermezzoResult> {
  const { actor, env } = await quizmaster();
  try {
    return await drawNext(env, actor);
  } catch (error) {
    logError("intermezzo.loten", error);
    return ONZE_KANT;
  }
}

export async function lootOpnieuw(): Promise<IntermezzoResult> {
  const { actor, env } = await quizmaster();
  try {
    return await redraw(env, actor);
  } catch (error) {
    logError("intermezzo.opnieuw", error);
    return ONZE_KANT;
  }
}

export async function speelInHetEcht(): Promise<IntermezzoResult> {
  const { actor, env } = await quizmaster();
  try {
    return await playInRealLife(env, actor);
  } catch (error) {
    logError("intermezzo.echt", error);
    return ONZE_KANT;
  }
}

export async function kiesWinnaar(winnerId: string): Promise<IntermezzoResult> {
  const { actor, env } = await quizmaster();
  if (!isUuid(winnerId)) return { fout: "Kies een van de twee spelers." };
  try {
    return await chooseWinnerInRealLife(env, winnerId, actor);
  } catch (error) {
    logError("intermezzo.winnaar", error);
    return ONZE_KANT;
  }
}

export async function stopDuels(): Promise<IntermezzoResult> {
  const { actor, env } = await quizmaster();
  try {
    await stopIntermezzo(env, actor);
    return { ok: true };
  } catch (error) {
    logError("intermezzo.stop", error);
    return ONZE_KANT;
  }
}
