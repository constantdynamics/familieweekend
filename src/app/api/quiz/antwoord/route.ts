import { canActAsCaptain, getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { fout, fromOwnSite, json, quizOpenFor, readBody } from "@/lib/server/quiz/http";
import { submitAnswer } from "@/lib/server/quiz/store";

/**
 * A captain's answer (SPEC §4.6 "Robuustheid"): only while the question is
 * open, only from the active captain device of the team, and the last
 * answer counts. The server checks the shape per question type.
 */
export async function POST(request: Request) {
  if (!fromOwnSite(request)) return fout("Dit verzoek komt niet uit de app.", 403);
  const ctx = await getActionContext();
  if (!ctx.deviceId) return fout("Vul eerst de familiecode in.", 401);
  if (!(await quizOpenFor(ctx))) return fout("De quiz is nog niet open.", 403);
  if (!canActAsCaptain(ctx) || !ctx.captainTeam) {
    return fout(
      ctx.captainTakenOver ? "Je teamtoestel is overgenomen door een ander toestel." : "Alleen de captain kan antwoorden.",
      403,
    );
  }
  const body = await readBody(request);
  if (!body || typeof body.vraag !== "string") return fout("Dit antwoord snapt de app niet. Kies opnieuw.", 400);
  try {
    const result = await submitAnswer(ctx.env, ctx.captainTeam.id, ctx.deviceId, body.vraag, body.antwoord);
    if (!result.ok) return fout(result.error, result.status);
    return json({ ok: true, antwoord: result.answer });
  } catch (error) {
    logError("quiz.antwoord", error);
    return fout("Je antwoord kwam niet aan. Tik nog een keer.", 500);
  }
}
