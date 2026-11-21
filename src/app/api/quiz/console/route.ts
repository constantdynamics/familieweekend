import { connection } from "next/server";
import type { Actor } from "@/lib/server/audit";
import { getActionContext, getRequestContext, type RequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { parsePointsInput } from "@/lib/server/quiz/answers";
import type { Command, Expectation } from "@/lib/server/quiz/engine";
import { fout, fromOwnSite, json, readBody } from "@/lib/server/quiz/http";
import { consoleViewFor, runConsoleCommand, setJokerByAdmin, setOverride } from "@/lib/server/quiz/store";
import { isUuid } from "@/lib/server/teams";

/** The quizmaster's console (SPEC §4.6): only the admin, never cached. */
function admin(ctx: RequestContext): Actor | null {
  return ctx.isAdmin && ctx.staff ? { id: ctx.staff.staffId, name: ctx.staff.name, role: ctx.staff.role } : null;
}

export async function GET(request: Request) {
  await connection();
  const ctx = await getRequestContext();
  if (!admin(ctx)) return fout("Alleen de quizmaster kan dit zien.", 403);
  const review = new URL(request.url).searchParams.get("vraag");
  try {
    return json(await consoleViewFor(ctx.env, review));
  } catch (error) {
    logError("quiz.console", error);
    return fout("De console kan de quiz even niet laden. Probeer het zo opnieuw.", 500);
  }
}

const STEPS = new Set([
  "hervat",
  "pauze",
  "toon",
  "sluit",
  "onthul",
  "volgende",
  "volgendeRonde",
  "vorige",
  "nog10",
  "intermezzo",
  "terugNaarQuiz",
  "afsluiten",
]);

function expectation(value: unknown): Expectation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const phase = typeof raw.phase === "string" ? raw.phase : null;
  return {
    phase: phase as Expectation["phase"],
    questionId: typeof raw.questionId === "string" ? raw.questionId : null,
    roundNo: typeof raw.roundNo === "number" ? raw.roundNo : null,
  };
}

export async function POST(request: Request) {
  if (!fromOwnSite(request)) return fout("Dit verzoek komt niet uit de app.", 403);
  const ctx = await getActionContext();
  const actor = admin(ctx);
  if (!actor) return fout("Alleen de quizmaster kan de quiz bedienen.", 403);
  const body = await readBody(request);
  const action = typeof body?.actie === "string" ? body.actie : "";
  try {
    if (action === "correctie") {
      const question = String(body?.vraag ?? "");
      const team = String(body?.team ?? "");
      let twelfths: number | null = null;
      if (body?.punten !== null && body?.punten !== undefined) {
        twelfths = parsePointsInput(String(body.punten));
        if (twelfths === null) return fout("Vul punten in als getal, bijvoorbeeld 1 of 0,5.", 400);
      }
      const result = await setOverride(ctx.env, actor, question, team, twelfths);
      return result.ok ? json({ ok: true }) : fout(result.error, result.status);
    }
    if (action === "joker") {
      const team = String(body?.team ?? "");
      const round = body?.ronde === null ? null : Number(body?.ronde);
      if (!isUuid(team) || (round !== null && (!Number.isInteger(round) || round < 1 || round > 20))) {
        return fout("Kies een team en een ronde.", 400);
      }
      const result = await setJokerByAdmin(ctx.env, actor, team, round);
      return result.ok ? json({ ok: true }) : fout(result.error, result.status);
    }

    let command: Command | null = null;
    if (action === "start" && isUuid(body?.quiz)) command = { type: "start", quizId: body.quiz as string };
    else if (action === "luister" && typeof body?.aan === "boolean") command = { type: "luister", on: body.aan };
    else if (STEPS.has(action)) command = { type: action } as Command;
    if (!command) return fout("Deze knop kent de quiz niet.", 400);

    const result = await runConsoleCommand(ctx.env, actor, command, expectation(body?.vanaf));
    return result.ok ? json({ ok: true }) : fout(result.error, result.status);
  } catch (error) {
    logError("quiz.console.stap", error, { actie: action });
    return fout("Er ging iets mis aan onze kant. Probeer het nog een keer.", 500);
  }
}
