"use server";

import { refresh } from "next/cache";
import { canActAsCaptain, getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";
import { isUuid } from "@/lib/server/teams";
import { setZeskampJoker } from "@/lib/server/zeskamp";

export type JokerState = { fout?: string; melding?: string };

/**
 * The captain puts the team's zeskamp joker on a game, moves it, or takes it
 * back (gameId null). Only before the game starts: then it is fixed.
 */
export async function zetZeskampJoker(gameId: string | null): Promise<JokerState> {
  const ctx = await getActionContext();
  const team = ctx.captainTeam;
  if (!team || !canActAsCaptain(ctx)) return { fout: "Alleen de captain kan de joker inzetten, op het teamtoestel." };
  const settings = await getSettings();
  if (!settings.fase2Live && !ctx.isAdmin) return { fout: "De zeskamp is nog niet open." };
  if (gameId !== null && !isUuid(gameId)) return { fout: "Dit spel bestaat niet meer." };
  try {
    const wie = ctx.names[0]?.displayName ?? "De captain";
    const outcome = await setZeskampJoker(ctx.env, team.id, gameId, { id: null, name: `${wie} (${team.name})`, role: "captain" }, { asAdmin: false });
    if (!outcome.ok) return { fout: outcome.fout };
    await ring(ctx.env);
    refresh();
    return { melding: outcome.melding };
  } catch (error) {
    logError("zeskamp.joker", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het zo opnieuw." };
  }
}
