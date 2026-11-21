"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/lib/server/audit";
import { getActionContext } from "@/lib/server/context";
import {
  addFunfactQuestion,
  adoptConcept,
  deleteFunfactQuestion,
  FunfactError,
  linkAiVersion,
  moveFunfactQuestion,
  removeAiVersion,
  setQuizVariant,
  updateFunfactQuestion,
  type QuestionInput,
} from "@/lib/server/funfacts";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";
import type { Env } from "@/lib/server/tokens";
import {
  isFunfactKind,
  NUMBER_LIMIT,
  OPTION_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  parseOptions,
  QUESTION_MAX,
} from "@/lib/shared/funfacts";

export type BeheerState = {
  fout?: string;
  gelukt?: string;
  velden?: Record<string, string>;
};

const ONZE_KANT = "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.";
const ALLEEN_ECHT =
  "De vragen en de quiz zijn voor de proef en het echte weekend hetzelfde. Verlaat eerst de proef om ze te wijzigen.";

async function beheer(): Promise<{ actor: Actor; env: Env }> {
  const staff = await requireAdmin();
  const ctx = await getActionContext();
  return { actor: { id: staff.staffId, name: staff.name, role: staff.role }, env: ctx.env };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").replace(/\s+/g, " ").trim();
}

function wholeNumber(value: string): number | null {
  return /^-?\d{1,7}$/.test(value) ? Number(value) : null;
}

/** Read and check the question form. */
function readQuestion(formData: FormData): { input: QuestionInput } | { velden: Record<string, string> } {
  const velden: Record<string, string> = {};
  const kind = String(formData.get("soort") ?? "");
  const vraag = text(formData, "vraag");
  const uitleg = text(formData, "uitleg");
  const quizvorm = text(formData, "quizvorm");
  if (!isFunfactKind(kind)) velden.soort = "Kies een soort vraag.";
  if (!vraag) velden.vraag = "Vul de vraag in.";
  if (vraag.length > QUESTION_MAX) velden.vraag = `Houd de vraag korter dan ${QUESTION_MAX} tekens.`;
  if (uitleg.length > QUESTION_MAX) velden.uitleg = `Houd de uitleg korter dan ${QUESTION_MAX} tekens.`;
  if (quizvorm.length > QUESTION_MAX) velden.quizvorm = `Houd de quizvorm korter dan ${QUESTION_MAX} tekens.`;

  let options: string[] | null = null;
  if (kind === "keuze") {
    options = parseOptions(String(formData.get("opties") ?? ""));
    if (options.length < OPTIONS_MIN) velden.opties = `Geef minstens ${OPTIONS_MIN} antwoorden, één per regel.`;
    else if (options.length > OPTIONS_MAX) velden.opties = `Houd het bij ${OPTIONS_MAX} antwoorden.`;
    else if (options.some((o) => o.length > OPTION_MAX)) velden.opties = `Houd elk antwoord korter dan ${OPTION_MAX} tekens.`;
  }

  let min: number | null = null;
  let max: number | null = null;
  if (kind === "getal") {
    min = wholeNumber(text(formData, "min"));
    max = wholeNumber(text(formData, "max"));
    if (min === null || Math.abs(min) > NUMBER_LIMIT) velden.min = "Vul een heel getal in.";
    if (max === null || Math.abs(max) > NUMBER_LIMIT) velden.max = "Vul een heel getal in.";
    if (min !== null && max !== null && max <= min) velden.max = "Het hoogste getal moet groter zijn dan het laagste.";
  }

  if (Object.keys(velden).length > 0) return { velden };
  return {
    input: {
      kind: kind as QuestionInput["kind"],
      text: vraag,
      hint: uitleg || null,
      options,
      min,
      max,
      quizForm: quizvorm || null,
      active: formData.get("actief") === "on",
    },
  };
}

/* Een vraag wijzigen of toevoegen. */
export async function bewaarVraag(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  if (env === "test") return { fout: ALLEEN_ECHT };
  const id = String(formData.get("id") ?? "");
  const gelezen = readQuestion(formData);
  if ("velden" in gelezen) return { fout: "Kijk even bij de rode tekst.", velden: gelezen.velden };
  try {
    if (isUuid(id)) await updateFunfactQuestion(env, id, gelezen.input, actor);
    else await addFunfactQuestion(env, gelezen.input, actor);
  } catch (error) {
    if (error instanceof FunfactError) return { fout: error.message };
    logError("beheer.funfacts.vraag", error);
    return { fout: ONZE_KANT };
  }
  redirect("/beheer/funfacts#vragen");
}

export async function verwijderVraag(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  if (env === "test") return { fout: ALLEEN_ECHT };
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { fout: "Deze vraag bestaat niet meer." };
  try {
    await deleteFunfactQuestion(env, id, actor);
  } catch (error) {
    if (error instanceof FunfactError) return { fout: error.message };
    logError("beheer.funfacts.verwijderen", error);
    return { fout: ONZE_KANT };
  }
  redirect("/beheer/funfacts#vragen");
}

/* Een plek omhoog of omlaag. */
export async function verplaatsVraag(formData: FormData): Promise<void> {
  const { actor, env } = await beheer();
  if (env === "test") return;
  const id = String(formData.get("id") ?? "");
  const richting = formData.get("richting") === "op" ? "op" : "neer";
  if (!isUuid(id)) return;
  try {
    await moveFunfactQuestion(env, id, richting, actor);
    refresh();
  } catch (error) {
    logError("beheer.funfacts.volgorde", error);
  }
}

/* Een conceptvraag met één tik in een ronde van de quiz zetten. */
export async function neemOver(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  if (env === "test") return { fout: "In de proef kun je conceptvragen bekijken, maar niet overnemen in de echte quiz." };
  const id = String(formData.get("id") ?? "");
  const ronde = Number(formData.get("ronde"));
  if (!isUuid(id)) return { fout: "Deze vraag bestaat niet meer." };
  if (!Number.isInteger(ronde) || ronde < 1 || ronde > 20) return { fout: "Kies een ronde." };
  try {
    const uitkomst = await adoptConcept(id, ronde, actor);
    await ring("live");
    refresh();
    return { gelukt: `Overgenomen in ronde ${uitkomst.round}: ${uitkomst.roundTitle}.` };
  } catch (error) {
    if (error instanceof FunfactError) return { fout: error.message };
    logError("beheer.funfacts.overnemen", error);
    return { fout: ONZE_KANT };
  }
}

/* Echt of AI: de AI-versie koppelen nadat hij is geüpload. */
export async function koppelAiVersie(invoer: { origineel: string; ai: string }): Promise<{ ok: true } | { ok: false; fout: string }> {
  const { actor, env } = await beheer();
  if (typeof invoer !== "object" || invoer === null || !isUuid(invoer.origineel) || !isUuid(invoer.ai)) {
    return { ok: false, fout: "Deze foto bestaat niet meer." };
  }
  try {
    await linkAiVersion(env, invoer.origineel, invoer.ai, actor);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof FunfactError) return { ok: false, fout: error.message };
    logError("beheer.funfacts.ai", error);
    return { ok: false, fout: ONZE_KANT };
  }
}

export async function verwijderAiVersie(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { fout: "Deze foto bestaat niet meer." };
  try {
    await removeAiVersion(env, id, actor);
    refresh();
    return { gelukt: "AI-versie verwijderd." };
  } catch (error) {
    if (error instanceof FunfactError) return { fout: error.message };
    logError("beheer.funfacts.ai.verwijderen", error);
    return { fout: ONZE_KANT };
  }
}

/* Welke versie in de quiz komt: echt of AI. */
export async function kiesQuizversie(_previous: BeheerState, formData: FormData): Promise<BeheerState> {
  const { actor, env } = await beheer();
  const id = String(formData.get("id") ?? "");
  const keuze = String(formData.get("versie") ?? "");
  const versie = keuze === "echt" || keuze === "ai" ? keuze : keuze === "geen" ? null : undefined;
  if (!isUuid(id) || versie === undefined) return { fout: "Kies echt of AI." };
  try {
    await setQuizVariant(env, id, versie, actor);
    refresh();
    return {
      gelukt:
        versie === "echt" ? "De echte foto komt in de quiz." : versie === "ai" ? "De AI-versie komt in de quiz." : "Keuze gewist.",
    };
  } catch (error) {
    if (error instanceof FunfactError) return { fout: error.message };
    logError("beheer.funfacts.quizversie", error);
    return { fout: ONZE_KANT };
  }
}
