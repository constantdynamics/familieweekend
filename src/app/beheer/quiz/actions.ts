"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import {
  createMainQuiz,
  deleteQuestion,
  importQuizSource,
  moveQuestion,
  QuizEditError,
  readQuestionForm,
  saveQuestion,
  saveRound,
  type QuestionForm,
} from "@/lib/server/quiz/editor";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";

export type QuizState = {
  fout?: string;
  fouten?: string[];
  gelukt?: string;
  waarschuwingen?: string[];
  velden?: Record<string, string>;
};

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";

async function beheer(): Promise<{ actor: Actor; env: "live" | "test" }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/* De hoofdquiz met de vijf rondes van SPEC §9.2. */
export async function maakQuiz(): Promise<void> {
  const { actor, env } = await beheer();
  try {
    await createMainQuiz(actor);
    await ring(env);
  } catch (error) {
    logError("beheer.quiz.maken", error);
  }
  refresh();
}

/* Een quizbestand (SPEC §9.2) inlezen. */
export async function importeerQuiz(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const { actor, env } = await beheer();
  const file = formData.get("bestand");
  let source = "";
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) return { fout: "Dit bestand is groter dan 2 MB. Is het wel een quizbestand?" };
    source = await file.text();
  } else {
    source = text(formData, "json");
  }
  if (!source) return { fout: "Kies eerst een quizbestand (JSON)." };
  try {
    const result = await importQuizSource(source, actor);
    if (!result.ok) return { fout: "Het bestand is niet ingelezen. Dit moet eerst anders:", fouten: result.errors };
    await ring(env);
    refresh();
    const { report } = result;
    const rondes = report.rounds === 1 ? "1 ronde" : `${report.rounds} rondes`;
    const vragen = report.questions === 1 ? "1 vraag" : `${report.questions} vragen`;
    return {
      gelukt: `Quiz ingelezen: ${rondes}, ${vragen} (${report.added} nieuw, ${report.changed} bijgewerkt, ${report.removed} weg).`,
      waarschuwingen: report.warnings,
    };
  } catch (error) {
    logError("beheer.quiz.import", error);
    return { fout: ONZE_KANT };
  }
}

/* Titel, uitleg, luistermodus en intermezzo van een ronde. */
export async function bewaarRonde(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const { actor, env } = await beheer();
  const id = text(formData, "id");
  const title = text(formData, "titel");
  const intro = text(formData, "intro") || null;
  const velden: Record<string, string> = {};
  if (!title) velden.titel = "Geef de ronde een titel.";
  if (title.length > 60) velden.titel = "Houd de titel korter dan 60 tekens.";
  if (intro && intro.length > 400) velden.intro = "Houd de uitleg korter dan 400 tekens.";
  if (Object.keys(velden).length > 0) return { fout: "Kijk even bij de rode tekst.", velden };
  try {
    await saveRound(id, { title, intro, listening: formData.get("luistermodus") === "on", intermezzoAfter: formData.get("intermezzo") === "on" }, actor);
    await ring(env);
    refresh();
    return { gelukt: "Ronde bewaard." };
  } catch (error) {
    if (error instanceof QuizEditError) return { fout: error.message };
    logError("beheer.quiz.ronde", error);
    return { fout: ONZE_KANT };
  }
}

function formFields(formData: FormData): QuestionForm {
  return {
    kind: text(formData, "soort"),
    text: text(formData, "vraag"),
    options: [0, 1, 2, 3].map((index) => text(formData, `optie${index}`)),
    correctChoice: text(formData, "goed_keuze"),
    correctBool: text(formData, "goed_waar"),
    correctRealOrAi: text(formData, "goed_echt"),
    correctNumber: text(formData, "goed_getal"),
    unit: text(formData, "eenheid"),
    lat: text(formData, "lat"),
    lng: text(formData, "lng"),
    scale: text(formData, "schaal"),
    explanation: text(formData, "uitleg"),
    note: text(formData, "notitie"),
    subjects: text(formData, "onderwerp"),
    photoUploadId: text(formData, "foto"),
    photoCredit: text(formData, "fotobron"),
    extId: text(formData, "id_bestand"),
  };
}

/* Een vraag toevoegen of wijzigen. */
export async function bewaarVraag(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const { actor, env } = await beheer();
  const roundId = text(formData, "ronde");
  const questionId = text(formData, "id");
  const checked = readQuestionForm(formFields(formData));
  if (!checked.ok) return { fout: "Kijk even bij de rode tekst.", velden: checked.errors };
  let saved: string;
  try {
    saved = await saveQuestion(roundId, isUuid(questionId) ? questionId : null, checked.question, actor);
    await ring(env);
  } catch (error) {
    if (error instanceof QuizEditError) return { fout: error.message };
    logError("beheer.quiz.vraag", error);
    return { fout: ONZE_KANT };
  }
  redirect(`/beheer/quiz/ronde/${roundId}#vraag-${saved}`);
}

export async function verwijderVraag(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const { actor, env } = await beheer();
  let roundId: string;
  try {
    roundId = await deleteQuestion(text(formData, "id"), actor);
    await ring(env);
  } catch (error) {
    if (error instanceof QuizEditError) return { fout: error.message };
    logError("beheer.quiz.vraag.verwijderen", error);
    return { fout: ONZE_KANT };
  }
  redirect(`/beheer/quiz/ronde/${roundId}`);
}

export async function verplaatsVraag(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  const direction = formData.get("richting") === "omhoog" ? "omhoog" : "omlaag";
  try {
    await moveQuestion(text(formData, "id"), direction, actor);
    await ring(env);
  } catch (error) {
    logError("beheer.quiz.vraag.verplaatsen", error);
  }
  refresh();
}
