import type { Metadata } from "next";
import { Suspense } from "react";
import { QuizConsole } from "@/components/quiz/QuizConsole";
import { getRequestContext } from "@/lib/server/context";
import { consoleViewFor } from "@/lib/server/quiz/store";
import { requireAdmin } from "@/lib/server/session";
import { BeheerLaden } from "../../onderdelen";

export const metadata: Metadata = { title: "Quizmaster" };

/** The quizmaster's console (SPEC §4.6): only for the admin, never cached by the service worker. */
export default function ConsolePage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const view = await consoleViewFor(ctx.env, null);
  return <QuizConsole initial={view} />;
}
