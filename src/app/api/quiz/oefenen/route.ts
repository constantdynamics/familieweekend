import { getActionContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { fout, fromOwnSite, json, readBody } from "@/lib/server/quiz/http";
import { magOefenen, oefenViewVoor } from "@/lib/server/quiz/oefenen";
import type { OefenFase } from "@/lib/server/quiz/oefenplan";

const FASEN: readonly OefenFase[] = ["rondescherm", "open", "onthuld"];

/**
 * One step of a practice run, as the captain of the practice team sees it.
 * Only for the beheerder and spelleiders. Nothing is stored: the answer
 * comes along with every request and goes back in the view.
 */
export async function POST(request: Request) {
  if (!fromOwnSite(request)) return fout("Dit verzoek komt niet uit de app.", 403);
  const ctx = await getActionContext();
  if (!magOefenen(ctx)) return fout("Oefenen is alleen voor de beheerder en de spelleiders.", 403);
  const body = await readBody(request);
  const fase = FASEN.find((value) => value === body?.fase);
  if (!body || typeof body.quiz !== "string" || !Number.isInteger(body.ronde) || (body.vraag !== null && typeof body.vraag !== "string") || !fase) {
    return fout("Dit snapt de app niet. Begin opnieuw met oefenen.", 400);
  }
  try {
    const view = await oefenViewVoor(ctx, body.quiz, { ronde: body.ronde as number, vraag: body.vraag as string | null }, fase, body.antwoord);
    if (!view) return fout("Deze vraag bestaat niet meer. Begin opnieuw met oefenen.", 404);
    return json(view);
  } catch (error) {
    logError("quiz.oefenen", error);
    return fout("Dat lukte even niet. Probeer het nog een keer.", 500);
  }
}
