import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { exportQuiz } from "@/lib/server/quiz/editor";
import { fout, NO_STORE } from "@/lib/server/quiz/http";
import { findDemoQuizId, findMainQuizId } from "@/lib/server/quiz/store";

/** The quiz as a file in the format of SPEC §9.2, as a backup. Only the admin. */
export async function GET(request: Request) {
  await connection();
  const ctx = await getRequestContext();
  if (!ctx.isAdmin) return fout("Alleen de beheerder kan de quiz exporteren.", 403);
  const which = new URL(request.url).searchParams.get("quiz");
  const quizId = which === "demo" ? await findDemoQuizId() : await findMainQuizId();
  const file = quizId ? await exportQuiz(quizId) : null;
  if (!file) return fout("Er is nog geen quiz om te exporteren.", 404);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`${JSON.stringify(file, null, 2)}\n`, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${which === "demo" ? "proefquiz" : "quiz"}-${date}.json"`,
    },
  });
}
