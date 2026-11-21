import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { closedView, fout, json, quizOpenFor } from "@/lib/server/quiz/http";
import { quizViewFor } from "@/lib/server/quiz/store";

/**
 * The quiz as this phone may see it (SPEC §7.2 and §7.3): the question only
 * from "open", the right answer only from "onthuld", a captain's own answer
 * only to that captain. Phones fetch this on every ring of the doorbell.
 */
export async function GET() {
  await connection();
  const ctx = await getRequestContext();
  try {
    if (!(await quizOpenFor(ctx))) return json(await closedView(ctx));
    return json(await quizViewFor(ctx));
  } catch (error) {
    logError("quiz.stand", error);
    return fout("De quiz is even niet bereikbaar. Probeer het zo opnieuw.", 500);
  }
}
