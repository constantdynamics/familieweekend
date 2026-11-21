/**
 * The quiz file of SPEC §9.2: checking it with clear Dutch messages, and
 * writing a stored quiz back to it (export as backup). Pure; used by
 * `npm run import:quiz`, the import in beheer and the export route. The
 * file itself never goes near the client bundle.
 */
import { z } from "zod";
import { readCorrect } from "./answers";
import { QUESTION_TYPES, isChoiceType, type QuestionType, type QuizContent } from "./types";

const TYPE_LIST = QUESTION_TYPES.join(", ");

function text(field: string, max: number) {
  return z
    .string({ error: (issue) => (issue.input === undefined ? `${field} ontbreekt.` : `${field} moet tekst zijn.`) })
    .trim()
    .min(1, `${field} is leeg.`)
    .max(max, `${field} is langer dan ${max} tekens.`);
}

function optionalText(field: string, max: number) {
  return z
    .string({ error: `${field} moet tekst zijn (of laat het veld weg).` })
    .trim()
    .max(max, `${field} is langer dan ${max} tekens.`)
    .nullish();
}

const placeSchema = z.strictObject(
  {
    lat: z
      .number({ error: "lat moet een getal zijn, bijvoorbeeld 50.865." })
      .min(-90, "lat ligt tussen -90 en 90.")
      .max(90, "lat ligt tussen -90 en 90."),
    lng: z
      .number({ error: "lng moet een getal zijn, bijvoorbeeld 5.832." })
      .min(-180, "lng ligt tussen -180 en 180.")
      .max(180, "lng ligt tussen -180 en 180."),
  },
  { error: "antwoord moet een plek zijn: {\"lat\": …, \"lng\": …}." },
);

export const questionSchema = z
  .strictObject(
    {
      id: z
        .string({ error: "id moet tekst zijn, bijvoorbeeld \"r1v1\"." })
        .trim()
        .min(1, "id is leeg.")
        .max(40, "id is langer dan 40 tekens.")
        .optional(),
      type: z.enum(QUESTION_TYPES, { error: `Onbekend type. Kies uit: ${TYPE_LIST}.` }),
      vraag: text("De vraag", 300),
      opties: z
        .array(text("Een optie", 80), { error: "opties moet een lijst met tekst zijn." })
        .optional(),
      goed: z.union([z.number(), z.boolean(), z.string()], { error: "goed moet een getal, true/false of \"echt\"/\"ai\" zijn." }).optional(),
      antwoord: z.union([z.number(), placeSchema], { error: "antwoord moet een getal of een plek {lat, lng} zijn." }).optional(),
      eenheid: optionalText("eenheid", 30),
      schaal: z.enum(["nederland", "wereld"], { error: "schaal is nederland of wereld." }).optional(),
      uitleg: optionalText("uitleg", 600),
      foto: optionalText("foto", 300),
      /** More photos of the same place, after `foto` (a map question in GeoGuessr style). */
      fotos: z
        .array(text("Een extra foto", 300), { error: "fotos moet een lijst met foto's zijn." })
        .max(4, "fotos heeft meer dan 4 extra foto's.")
        .optional(),
      foto_bron: optionalText("foto_bron", 120),
      onderwerp: z
        .array(text("Een naam bij onderwerp", 60), { error: "onderwerp moet een lijst met namen zijn." })
        .max(12, "onderwerp heeft meer dan 12 namen.")
        .nullish(),
      notitie: optionalText("notitie", 300),
    },
    { error: "Een vraag moet een object zijn: { \"type\": …, \"vraag\": … }." },
  )
  .superRefine((question, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    const kind = question.type;
    if (isChoiceType(kind)) {
      const options = question.opties;
      if (!options) issue("Bij dit type horen 2 tot 4 opties.", "opties");
      else if (options.length < 2 || options.length > 4) issue(`Bij dit type horen 2 tot 4 opties, dit zijn er ${options.length}.`, "opties");
      else if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) issue("Twee opties zijn hetzelfde.", "opties");
      const max = (options?.length ?? 4) - 1;
      if (typeof question.goed !== "number" || !Number.isInteger(question.goed) || question.goed < 0 || question.goed > max) {
        issue(
          max >= 1
            ? `goed is het nummer van de goede optie: 0 voor de eerste, ${max} voor de laatste.`
            : "goed is het nummer van de goede optie: 0 voor de eerste.",
          "goed",
        );
      }
      if (question.antwoord !== undefined) issue("Bij dit type hoort geen antwoord, alleen goed.", "antwoord");
    } else {
      if (question.opties !== undefined && question.opties.length > 0) issue("Bij dit type horen geen opties.", "opties");
    }
    if (kind === "waar_niet_waar" && typeof question.goed !== "boolean") issue("goed is true (waar) of false (niet waar).", "goed");
    if (kind === "echt_of_ai" && !(typeof question.goed === "string" && ["echt", "ai"].includes(question.goed.toLowerCase()))) {
      issue("goed is \"echt\" of \"ai\".", "goed");
    }
    if (kind === "schatting") {
      if (typeof question.antwoord !== "number" || !Number.isFinite(question.antwoord)) issue("antwoord is het goede getal.", "antwoord");
      if (question.goed !== undefined) issue("Bij een schatting staat het goede getal in antwoord, niet in goed.", "goed");
    }
    if (kind === "kaart") {
      if (typeof question.antwoord !== "object" || question.antwoord === null) issue("antwoord is de goede plek: {\"lat\": …, \"lng\": …}.", "antwoord");
      if (!question.schaal) issue("Kies een schaal: nederland of wereld.", "schaal");
      if (question.goed !== undefined) issue("Bij een kaartvraag staat de plek in antwoord, niet in goed.", "goed");
    } else if (question.schaal !== undefined) {
      issue("Alleen een kaartvraag heeft een schaal.", "schaal");
    }
    if ((kind === "waar_niet_waar" || kind === "echt_of_ai") && question.antwoord !== undefined) {
      issue("Bij dit type staat het goede antwoord in goed, niet in antwoord.", "antwoord");
    }
  });

export const roundSchema = z.strictObject(
  {
    nummer: z
      .number({ error: (issue) => (issue.input === undefined ? "nummer ontbreekt." : "nummer moet een getal zijn.") })
      .int("nummer is een heel getal.")
      .min(1, "nummer is 1 of hoger.")
      .max(20, "nummer is hoogstens 20."),
    titel: text("De titel van de ronde", 60),
    intro: optionalText("intro", 400),
    luistermodus: z.boolean({ error: "luistermodus is true of false." }).optional(),
    intermezzo_na: z.boolean({ error: "intermezzo_na is true of false." }).optional(),
    vragen: z.array(questionSchema, { error: "vragen moet een lijst zijn." }).max(30, "Een ronde heeft hoogstens 30 vragen."),
  },
  { error: "Een ronde moet een object zijn: { \"nummer\": …, \"titel\": …, \"vragen\": [ … ] }." },
);

export const quizFileSchema = z
  .strictObject(
    {
      titel: text("De titel van de quiz", 80),
      rondes: z
        .array(roundSchema, { error: "rondes moet een lijst zijn." })
        .min(1, "Er staat geen enkele ronde in.")
        .max(20, "Een quiz heeft hoogstens 20 rondes."),
    },
    { error: "Het bestand moet één object zijn: { \"titel\": …, \"rondes\": [ … ] }." },
  )
  .superRefine((quiz, ctx) => {
    const numbers = new Map<number, number>();
    quiz.rondes.forEach((round, index) => {
      const earlier = numbers.get(round.nummer);
      if (earlier !== undefined) {
        ctx.addIssue({ code: "custom", message: `Rondenummer ${round.nummer} staat er twee keer in.`, path: ["rondes", index, "nummer"] });
      }
      numbers.set(round.nummer, index);
    });
    const ids = new Set<string>();
    quiz.rondes.forEach((round, r) =>
      round.vragen.forEach((question, q) => {
        if (!question.id) return;
        const key = question.id.toLowerCase();
        if (ids.has(key)) {
          ctx.addIssue({ code: "custom", message: `De id "${question.id}" staat er twee keer in.`, path: ["rondes", r, "vragen", q, "id"] });
        }
        ids.add(key);
      }),
    );
    if (quiz.rondes.every((round) => round.vragen.length === 0)) {
      ctx.addIssue({ code: "custom", message: "Er staat geen enkele vraag in.", path: ["rondes"] });
    }
  });

export type QuizFile = z.infer<typeof quizFileSchema>;
export type QuizFileQuestion = z.infer<typeof questionSchema>;

/** One question ready for the database. */
export type QuestionInput = {
  extId: string | null;
  kind: QuestionType;
  text: string;
  options: string[] | null;
  correct: number | boolean | "echt" | "ai" | { lat: number; lng: number };
  unit: string | null;
  scale: "nederland" | "wereld" | null;
  explanation: string | null;
  /** An upload id or a file name, as written in the file. */
  photo: string | null;
  /** More photos after the first, as upload ids or file names (at most 4). */
  extraPhotos?: string[];
  photoCredit: string | null;
  subjects: string[];
  note: string | null;
};

export type RoundInput = {
  number: number;
  title: string;
  intro: string | null;
  listening: boolean;
  intermezzoAfter: boolean;
  questions: QuestionInput[];
};

export type QuizInput = { title: string; rounds: RoundInput[] };

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function toQuestionInput(question: QuizFileQuestion): QuestionInput {
  let correct: QuestionInput["correct"];
  if (question.type === "schatting") correct = question.antwoord as number;
  else if (question.type === "kaart") correct = question.antwoord as { lat: number; lng: number };
  else if (question.type === "echt_of_ai") correct = String(question.goed).toLowerCase() === "ai" ? "ai" : "echt";
  else correct = question.goed as number | boolean;
  return {
    extId: clean(question.id),
    kind: question.type,
    text: question.vraag,
    options: isChoiceType(question.type) ? (question.opties ?? []) : null,
    correct,
    unit: question.type === "schatting" ? clean(question.eenheid) : null,
    scale: question.type === "kaart" ? (question.schaal ?? "nederland") : null,
    explanation: clean(question.uitleg),
    photo: clean(question.foto),
    ...(question.fotos?.length ? { extraPhotos: question.fotos.map((name) => name.trim()).filter(Boolean) } : {}),
    photoCredit: clean(question.foto_bron),
    subjects: (question.onderwerp ?? []).map((name) => name.trim()).filter(Boolean),
    note: clean(question.notitie),
  };
}

export function toQuizInput(file: QuizFile): QuizInput {
  return {
    title: file.titel,
    rounds: [...file.rondes]
      .sort((a, b) => a.nummer - b.nummer)
      .map((round) => ({
        number: round.nummer,
        title: round.titel,
        intro: clean(round.intro),
        listening: round.luistermodus ?? false,
        intermezzoAfter: round.intermezzo_na ?? false,
        questions: round.vragen.map(toQuestionInput),
      })),
  };
}

export type ParseResult = { ok: true; quiz: QuizInput; file: QuizFile } | { ok: false; errors: string[] };

/** Where an issue is, in words: "Ronde 2, vraag 3 (r2v3), opties". */
function describe(raw: unknown, path: readonly PropertyKey[]): string {
  const parts: string[] = [];
  const at = (value: unknown, key: PropertyKey) =>
    value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined;
  let node: unknown = raw;
  for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    const next = at(node, key);
    if (path[index - 1] === "rondes" && typeof key === "number") {
      const number = at(next, "nummer");
      parts.push(typeof number === "number" ? `Ronde ${number}` : `Ronde ${key + 1} in de lijst`);
    } else if (path[index - 1] === "vragen" && typeof key === "number") {
      const id = at(next, "id");
      parts.push(typeof id === "string" && id.trim() ? `vraag ${key + 1} (${id.trim()})` : `vraag ${key + 1}`);
    } else if (path[index - 1] === "opties" && typeof key === "number") {
      parts.push(`optie ${key + 1}`);
    } else if (path[index - 1] === "onderwerp" && typeof key === "number") {
      parts.push(`naam ${key + 1}`);
    } else if (key !== "rondes" && key !== "vragen") {
      parts.push(String(key));
    }
    node = next;
  }
  return parts.join(", ");
}

function jsonError(error: unknown, source: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)/.exec(message);
  if (position) {
    const line = source.slice(0, Number(position[1])).split("\n").length;
    return `Dit is geen geldige JSON: er klopt iets niet op regel ${line}. Kijk naar komma's, aanhalingstekens en haakjes.`;
  }
  return "Dit is geen geldige JSON. Kijk naar komma's, aanhalingstekens en haakjes.";
}

/** Check a quiz file. The errors say where and what, in Dutch. */
export function parseQuizFile(source: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(source.replace(/^﻿/, ""));
  } catch (error) {
    return { ok: false, errors: [jsonError(error, source)] };
  }
  const parsed = quizFileSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 40).map((issue) => {
      const where = describe(raw, issue.path);
      const message =
        issue.code === "unrecognized_keys"
          ? `Onbekend veld: ${issue.keys.join(", ")}. Haal het weg of kijk of het goed gespeld is.`
          : issue.message;
      return where ? `${where}: ${message}` : message;
    });
    if (parsed.error.issues.length > 40) errors.push(`En nog ${parsed.error.issues.length - 40} andere fouten.`);
    return { ok: false, errors };
  }
  return { ok: true, quiz: toQuizInput(parsed.data), file: parsed.data };
}

/** A stored quiz as a quiz file (export, and the backup before an import). */
export function toQuizFile(content: QuizContent): QuizFile {
  return {
    titel: content.title,
    rondes: content.rounds.map((round) => ({
      nummer: round.number,
      titel: round.title,
      ...(round.intro ? { intro: round.intro } : {}),
      luistermodus: round.listening,
      intermezzo_na: round.intermezzoAfter,
      vragen: round.questions.map((question) => {
        const correct = readCorrect(question);
        const entry: QuizFileQuestion = {
          ...(question.extId ? { id: question.extId } : {}),
          type: question.kind,
          vraag: question.text,
        };
        if (isChoiceType(question.kind)) {
          entry.opties = question.options ?? [];
          if (typeof correct === "number") entry.goed = correct;
        } else if (question.kind === "waar_niet_waar" || question.kind === "echt_of_ai") {
          if (correct !== null) entry.goed = correct as boolean | string;
        } else if (question.kind === "schatting") {
          if (typeof correct === "number") entry.antwoord = correct;
          if (question.unit) entry.eenheid = question.unit;
        } else if (question.kind === "kaart") {
          if (correct && typeof correct === "object") entry.antwoord = correct as { lat: number; lng: number };
          entry.schaal = question.scale ?? "nederland";
        }
        if (question.explanation) entry.uitleg = question.explanation;
        entry.foto = question.photoUploadId;
        if (question.extraPhotoIds?.length) entry.fotos = question.extraPhotoIds;
        if (question.photoCredit) entry.foto_bron = question.photoCredit;
        entry.onderwerp = question.subjects;
        entry.notitie = question.note ?? "";
        return entry;
      }),
    })),
  };
}
