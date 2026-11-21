import { canActAsCaptain, getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { fout, fromOwnSite, json, quizOpenFor, readBody } from "@/lib/server/quiz/http";
import { playJoker } from "@/lib/server/quiz/store";

/**
 * The captain plays the team's quiz joker (SPEC §4.6 "Joker in de quiz"):
 * once per quiz, on the round screen, before the round's first question.
 */
export async function POST(request: Request) {
  if (!fromOwnSite(request)) return fout("Dit verzoek komt niet uit de app.", 403);
  const ctx = await getActionContext();
  if (!ctx.deviceId) return fout("Vul eerst de familiecode in.", 401);
  if (!(await quizOpenFor(ctx))) return fout("De quiz is nog niet open.", 403);
  if (!canActAsCaptain(ctx) || !ctx.captainTeam) return fout("Alleen de captain kan de joker inzetten.", 403);
  const body = await readBody(request);
  const round = Number(body?.ronde);
  if (!Number.isInteger(round) || round < 1 || round > 20) return fout("Kies een ronde.", 400);
  try {
    const name = ctx.names.find((n) => n.teamId === ctx.captainTeam?.id)?.displayName ?? `Captain van ${ctx.captainTeam.name}`;
    const result = await playJoker(ctx.env, ctx.captainTeam.id, round, { id: null, name, role: "captain" });
    if (!result.ok) return fout(result.error, result.status);
    return json({ ok: true });
  } catch (error) {
    logError("quiz.joker", error);
    return fout("De joker kwam niet aan. Probeer het nog een keer.", 500);
  }
}
