import { getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { fout, fromOwnSite, json, readBody } from "@/lib/server/quiz/http";
import { answerForBots } from "@/lib/server/quiz/store";
import { isUuid } from "@/lib/server/teams";

/**
 * "Nepteams antwoorden vanzelf": the console asks this, one team at a time
 * after a random delay. Only the admin, only in the test environment, and
 * only for test teams without a captain device.
 */
export async function POST(request: Request) {
  if (!fromOwnSite(request)) return fout("Dit verzoek komt niet uit de app.", 403);
  const ctx = await getActionContext();
  if (!ctx.isAdmin) return fout("Alleen de quizmaster kan dit.", 403);
  if (ctx.env !== "test") return fout("Nepteams spelen alleen mee in de proef.", 403);
  const body = await readBody(request);
  const team = isUuid(body?.team) ? (body.team as string) : null;
  try {
    const result = await answerForBots(ctx.env, team);
    return result.ok ? json({ ok: true, beantwoord: result.answered }) : fout(result.error, result.status);
  } catch (error) {
    logError("quiz.nepteams", error);
    return fout("De nepteams kwamen even niet aan bod.", 500);
  }
}
