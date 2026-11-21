import "server-only";
import type postgres from "postgres";
import { logAudit, type Actor } from "../audit";
import { db } from "../db";
import { isUuid } from "../teams";
import { maxPointsFor } from "./answers";
import { parseQuizFile, questionSchema, toQuestionInput, type QuestionInput, type QuizInput } from "./format";
import { nameKey } from "./fairness";
import { ensureMainQuiz, findMainQuizId, loadContent, type Sql } from "./content";
import { toQuizFile, type QuizFile } from "./format";
import { isChoiceType, type QuestionType } from "./types";

/**
 * Changing the quiz content: the rounds, the question editor in beheer, the
 * import of a quiz file (beheer and `npm run import:quiz`) and the export.
 * Every change is logged. Questions that were already played in the real
 * quiz cannot be removed, and an import never wipes real answers.
 */

export class QuizEditError extends Error {}

/** Round maxima follow the questions (a map question is worth up to 3). */
export async function refreshMaxPoints(sql: Sql, roundIds: readonly string[]): Promise<void> {
  for (const roundId of roundIds) {
    const rows = await sql<{ kind: QuestionInput["kind"] }[]>`select kind from valk.quiz_questions where round_id = ${roundId}`;
    const max = rows.reduce((sum, row) => sum + maxPointsFor(row), 0);
    await sql`update valk.quiz_rounds set max_points = ${max} where id = ${roundId}`;
  }
}

async function touchQuiz(sql: Sql, quizId: string): Promise<void> {
  await sql`update valk.quizzes set updated_at = now() where id = ${quizId}`;
}

/** The main quiz with the five rounds of SPEC §9.2, made when it is not there yet. */
export async function createMainQuiz(actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    const before = await findMainQuizId(sql);
    const id = await ensureMainQuiz(sql);
    if (!before) await logAudit(actor, { action: "quiz.aangemaakt", entity: "quiz", entityId: id, newValue: { rondes: 5 } }, sql);
    return id;
  });
}

export type RoundSettings = { title: string; intro: string | null; listening: boolean; intermezzoAfter: boolean };

export async function saveRound(roundId: string, input: RoundSettings, actor: Actor): Promise<void> {
  if (!isUuid(roundId)) throw new QuizEditError("Deze ronde bestaat niet meer.");
  await db().begin(async (sql) => {
    const [before] = await sql<{ quiz_id: string; number: number; title: string; intro: string | null; listening: boolean; intermezzo_after: boolean }[]>`
      select quiz_id, number, title, intro, listening, intermezzo_after from valk.quiz_rounds where id = ${roundId} for update
    `;
    if (!before) throw new QuizEditError("Deze ronde bestaat niet meer.");
    await sql`
      update valk.quiz_rounds set title = ${input.title}, intro = ${input.intro}, listening = ${input.listening},
        intermezzo_after = ${input.intermezzoAfter}
      where id = ${roundId}
    `;
    await touchQuiz(sql, before.quiz_id);
    await logAudit(
      actor,
      {
        action: "quiz.ronde",
        entity: "quiz_ronde",
        entityId: roundId,
        oldValue: { ronde: before.number, titel: before.title, intro: before.intro, luistermodus: before.listening, intermezzo: before.intermezzo_after },
        newValue: { ronde: before.number, titel: input.title, intro: input.intro, luistermodus: input.listening, intermezzo: input.intermezzoAfter },
      },
      sql,
    );
  });
}

/** A photo for a question: an upload that exists and may be shown in the quiz. */
async function checkPhoto(sql: Sql, uploadId: string | null): Promise<string | null> {
  if (!uploadId) return null;
  if (!isUuid(uploadId)) throw new QuizEditError("Deze foto bestaat niet meer. Upload hem opnieuw.");
  const [row] = await sql<{ id: string }[]>`select id from valk.uploads where id = ${uploadId} and kind in ('quiz', 'funfact', 'ai')`;
  if (!row) throw new QuizEditError("Deze foto bestaat niet meer. Upload hem opnieuw.");
  return row.id;
}

/** The fields of the question editor, as typed. */
export type QuestionForm = {
  kind: string;
  text: string;
  options: string[];
  correctChoice: string;
  correctBool: string;
  correctRealOrAi: string;
  correctNumber: string;
  unit: string;
  lat: string;
  lng: string;
  scale: string;
  explanation: string;
  note: string;
  subjects: string;
  photoUploadId: string;
  /** The photos after the first (map questions), in order. */
  extraPhotoIds: string[];
  photoCredit: string;
  extId: string;
};

function number(text: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Check the editor's fields with the rules of the quiz file. Returns the
 * question, or Dutch messages per field.
 */
export function readQuestionForm(form: QuestionForm): { ok: true; question: QuestionInput } | { ok: false; errors: Record<string, string> } {
  const kind = form.kind;
  const options = form.options.map((option) => option.trim()).filter(Boolean);
  const file: Record<string, unknown> = { type: kind, vraag: form.text };
  if (form.extId.trim()) file.id = form.extId.trim();
  if (isChoiceType(kind as QuestionType)) {
    file.opties = options;
    file.goed = form.correctChoice === "" ? undefined : Number(form.correctChoice);
  } else if (kind === "waar_niet_waar") {
    file.goed = form.correctBool === "waar" ? true : form.correctBool === "niet_waar" ? false : undefined;
  } else if (kind === "echt_of_ai") {
    file.goed = form.correctRealOrAi || undefined;
  } else if (kind === "schatting") {
    file.antwoord = number(form.correctNumber);
    if (form.unit.trim()) file.eenheid = form.unit.trim();
  } else if (kind === "kaart") {
    const lat = number(form.lat);
    const lng = number(form.lng);
    file.antwoord = lat === undefined && lng === undefined ? undefined : { lat, lng };
    file.schaal = form.scale || undefined;
  }
  if (form.explanation.trim()) file.uitleg = form.explanation.trim();
  if (form.note.trim()) file.notitie = form.note.trim();
  if (form.photoCredit.trim()) file.foto_bron = form.photoCredit.trim();
  const subjects = form.subjects
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (subjects.length > 0) file.onderwerp = subjects;

  const parsed = questionSchema.safeParse(file);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    const field: Record<string, string> = {
      type: "soort",
      vraag: "vraag",
      opties: "opties",
      goed: "goed",
      antwoord: "goed",
      eenheid: "eenheid",
      schaal: "schaal",
      uitleg: "uitleg",
      notitie: "notitie",
      onderwerp: "onderwerp",
      foto_bron: "fotobron",
      id: "id",
    };
    for (const issue of parsed.error.issues) {
      const key = field[String(issue.path[0] ?? "")] ?? "vraag";
      errors[key] ??=
        kind === "kaart" && key === "goed" && issue.path.length > 1
          ? "Vul een geldige plek in: breedtegraad tussen -90 en 90, lengtegraad tussen -180 en 180."
          : issue.message;
    }
    return { ok: false, errors };
  }
  const photo = form.photoUploadId.trim() || null;
  const extraPhotos = form.extraPhotoIds.map((id) => id.trim()).filter(Boolean);
  if (extraPhotos.length > 4) return { ok: false, errors: { foto: "Hoogstens 5 foto's bij een vraag." } };
  return {
    ok: true,
    question: {
      ...toQuestionInput(parsed.data),
      // Without a first photo, the first extra one moves up.
      photo: photo ?? extraPhotos[0] ?? null,
      extraPhotos: photo ? extraPhotos : extraPhotos.slice(1),
    },
  };
}

/** Add a question to a round (questionId null) or change one. Returns its id. */
export async function saveQuestion(roundId: string, questionId: string | null, input: QuestionInput, actor: Actor): Promise<string> {
  if (!isUuid(roundId)) throw new QuizEditError("Deze ronde bestaat niet meer.");
  return db().begin(async (sql) => {
    const [round] = await sql<{ id: string; quiz_id: string; number: number }[]>`
      select id, quiz_id, number from valk.quiz_rounds where id = ${roundId}
    `;
    if (!round) throw new QuizEditError("Deze ronde bestaat niet meer.");
    const photo = await checkPhoto(sql, input.photo);
    // More photos of the same place belong to a map question only.
    const extraPhotos: string[] = [];
    if (photo && input.kind === "kaart") {
      for (const id of input.extraPhotos ?? []) {
        const checked = await checkPhoto(sql, id);
        if (checked && checked !== photo && !extraPhotos.includes(checked)) extraPhotos.push(checked);
      }
    }
    const values = {
      kind: input.kind,
      text: input.text,
      options: input.options === null ? null : sql.json(input.options),
      correct: sql.json(input.correct as postgres.JSONValue),
      unit: input.unit,
      scale: input.scale,
      explanation: input.explanation,
      photo_upload_id: photo,
      extra_photo_ids: extraPhotos.slice(0, 4),
      photo_credit: photo ? input.photoCredit : null,
      subjects: sql.json(input.subjects),
      note: input.note,
      ext_id: input.extId,
    };
    let id: string;
    if (questionId) {
      if (!isUuid(questionId)) throw new QuizEditError("Deze vraag bestaat niet meer.");
      const [before] = await sql<{ round_id: string; text: string; correct: unknown; kind: string }[]>`
        select round_id, text, correct, kind from valk.quiz_questions where id = ${questionId} for update
      `;
      if (!before) throw new QuizEditError("Deze vraag bestaat niet meer.");
      await sql`
        update valk.quiz_questions set
          kind = ${values.kind}, text = ${values.text}, options = ${values.options}, correct = ${values.correct},
          unit = ${values.unit}, scale = ${values.scale}, explanation = ${values.explanation},
          photo_upload_id = ${values.photo_upload_id}, extra_photo_ids = ${values.extra_photo_ids}::uuid[],
          photo_credit = ${values.photo_credit},
          subjects = ${values.subjects}, note = ${values.note}, ext_id = ${values.ext_id}, updated_at = now()
        where id = ${questionId}
      `;
      id = questionId;
      await logAudit(
        actor,
        {
          action: "quiz.vraag",
          entity: "quiz_vraag",
          entityId: id,
          oldValue: { vraag: before.text, soort: before.kind, goed: before.correct as postgres.JSONValue },
          newValue: { actie: "gewijzigd", ronde: round.number, vraag: input.text, soort: input.kind, goed: input.correct as postgres.JSONValue },
        },
        sql,
      );
    } else {
      const [last] = await sql<{ sort: number | null }[]>`select max(sort) as sort from valk.quiz_questions where round_id = ${roundId}`;
      const [row] = await sql<{ id: string }[]>`
        insert into valk.quiz_questions (round_id, sort, ext_id, kind, text, options, correct, unit, scale, explanation,
          photo_upload_id, extra_photo_ids, photo_credit, subjects, note)
        values (${roundId}, ${(last?.sort ?? 0) + 1}, ${values.ext_id}, ${values.kind}, ${values.text}, ${values.options},
          ${values.correct}, ${values.unit}, ${values.scale}, ${values.explanation}, ${values.photo_upload_id},
          ${values.extra_photo_ids}::uuid[], ${values.photo_credit}, ${values.subjects}, ${values.note})
        returning id
      `;
      id = row.id;
      await logAudit(
        actor,
        { action: "quiz.vraag", entity: "quiz_vraag", entityId: id, newValue: { actie: "toegevoegd", ronde: round.number, vraag: input.text } },
        sql,
      );
    }
    await refreshMaxPoints(sql, [roundId]);
    await touchQuiz(sql, round.quiz_id);
    return id;
  });
}

async function playedLive(sql: Sql, questionId: string): Promise<boolean> {
  const [row] = await sql<{ played: boolean }[]>`
    select exists (select 1 from valk.quiz_answers where env = 'live' and question_id = ${questionId}) as played
  `;
  return Boolean(row?.played);
}

export async function deleteQuestion(questionId: string, actor: Actor): Promise<string> {
  if (!isUuid(questionId)) throw new QuizEditError("Deze vraag bestaat niet meer.");
  return db().begin(async (sql) => {
    const [row] = await sql<{ round_id: string; text: string; quiz_id: string; number: number }[]>`
      select q.round_id, q.text, r.quiz_id, r.number from valk.quiz_questions q join valk.quiz_rounds r on r.id = q.round_id
      where q.id = ${questionId} for update of q
    `;
    if (!row) throw new QuizEditError("Deze vraag bestaat niet meer.");
    if (await playedLive(sql, questionId)) {
      throw new QuizEditError("Deze vraag is al gespeeld in de echte quiz. Verwijderen kan niet meer; pas hem aan of corrigeer de punten.");
    }
    const [live] = await sql<{ busy: boolean }[]>`
      select exists (select 1 from valk.live_state where question_id = ${questionId} and mode in ('quiz', 'intermezzo')) as busy
    `;
    if (live?.busy) throw new QuizEditError("Deze vraag staat nu op de telefoons. Ga eerst verder in de quiz.");
    await sql`delete from valk.quiz_questions where id = ${questionId}`;
    await refreshMaxPoints(sql, [row.round_id]);
    await touchQuiz(sql, row.quiz_id);
    await logAudit(
      actor,
      { action: "quiz.vraag", entity: "quiz_vraag", entityId: questionId, oldValue: { ronde: row.number, vraag: row.text }, newValue: { actie: "verwijderd" } },
      sql,
    );
    return row.round_id;
  });
}

/** Move a question one place up or down in its round. */
export async function moveQuestion(questionId: string, direction: "omhoog" | "omlaag", actor: Actor): Promise<void> {
  if (!isUuid(questionId)) throw new QuizEditError("Deze vraag bestaat niet meer.");
  await db().begin(async (sql) => {
    const [row] = await sql<{ round_id: string }[]>`select round_id from valk.quiz_questions where id = ${questionId}`;
    if (!row) throw new QuizEditError("Deze vraag bestaat niet meer.");
    const list = await sql<{ id: string; text: string }[]>`
      select id, text from valk.quiz_questions where round_id = ${row.round_id} order by sort, id for update
    `;
    const index = list.findIndex((item) => item.id === questionId);
    const target = direction === "omhoog" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    for (const [position, item] of list.entries()) {
      await sql`update valk.quiz_questions set sort = ${position + 1} where id = ${item.id}`;
    }
    await logAudit(
      actor,
      { action: "quiz.vraag", entity: "quiz_vraag", entityId: questionId, newValue: { actie: "verplaatst", richting: direction, plek: target + 1, vraag: list[target].text } },
      sql,
    );
  });
}

/* ------------------------------------------------------------------------ */
/* Import and export (SPEC §9.2).                                            */
/* ------------------------------------------------------------------------ */

/** Turns a `foto` value from the file into an upload id (the command line reads files from disk). */
export type PhotoResolver = (name: string, sql: postgres.TransactionSql) => Promise<string | null>;

export type ImportReport = {
  quizId: string;
  rounds: number;
  questions: number;
  added: number;
  changed: number;
  removed: number;
  warnings: string[];
};

/**
 * Write a checked quiz into the main quiz. Rounds are matched by number and
 * questions by their id in the file, so a question that keeps its id keeps
 * its place in the database. Everything else is replaced by the file.
 */
export async function writeQuiz(
  sql: postgres.TransactionSql,
  input: QuizInput,
  actor: Actor,
  resolvePhoto: PhotoResolver | null,
): Promise<ImportReport> {
  const quizId = await ensureMainQuiz(sql);
  const [busy] = await sql<{ busy: boolean }[]>`
    select exists (select 1 from valk.live_state where quiz_id = ${quizId} and mode in ('quiz', 'intermezzo')) as busy
  `;
  if (busy?.busy) throw new QuizEditError("De quiz loopt nu. Importeren kan pas als hij is afgelopen.");
  const [played] = await sql<{ count: number }[]>`
    select count(*)::int as count from valk.quiz_answers a
    join valk.quiz_questions q on q.id = a.question_id join valk.quiz_rounds r on r.id = q.round_id
    where a.env = 'live' and r.quiz_id = ${quizId}
  `;
  if ((played?.count ?? 0) > 0) {
    throw new QuizEditError("In de echte quiz zijn al antwoorden gegeven. Een import zou die wissen, dus dat kan niet meer.");
  }

  const warnings: string[] = [];
  const people = await sql<{ name: string; nickname: string | null }[]>`select name, nickname from valk.participants where env = 'live'`;
  const known = new Set(people.flatMap((p) => [nameKey(p.name), ...(p.nickname ? [nameKey(p.nickname)] : [])]));

  const existingRounds = await sql<{ id: string; number: number }[]>`select id, number from valk.quiz_rounds where quiz_id = ${quizId}`;
  const existingQuestions = await sql<{ id: string; ext_id: string | null; photo_upload_id: string | null }[]>`
    select q.id, q.ext_id, q.photo_upload_id from valk.quiz_questions q join valk.quiz_rounds r on r.id = q.round_id
    where r.quiz_id = ${quizId}
  `;
  const byExt = new Map(existingQuestions.filter((q) => q.ext_id).map((q) => [q.ext_id!.toLowerCase(), q]));
  const keep = new Set<string>();
  const roundIds: string[] = [];
  let added = 0;
  let changed = 0;

  for (const round of input.rounds) {
    const current = existingRounds.find((r) => r.number === round.number);
    let roundId: string;
    if (current) {
      await sql`
        update valk.quiz_rounds set title = ${round.title}, intro = ${round.intro}, listening = ${round.listening},
          intermezzo_after = ${round.intermezzoAfter}
        where id = ${current.id}
      `;
      roundId = current.id;
    } else {
      const [row] = await sql<{ id: string }[]>`
        insert into valk.quiz_rounds (quiz_id, number, title, intro, listening, intermezzo_after)
        values (${quizId}, ${round.number}, ${round.title}, ${round.intro}, ${round.listening}, ${round.intermezzoAfter})
        returning id
      `;
      roundId = row.id;
    }
    roundIds.push(roundId);

    for (const [index, question] of round.questions.entries()) {
      const where = `Ronde ${round.number}, vraag ${index + 1}${question.extId ? ` (${question.extId})` : ""}`;
      const match = question.extId ? byExt.get(question.extId.toLowerCase()) : undefined;
      let photo: string | null = null;
      if (question.photo) {
        if (isUuid(question.photo)) {
          const [upload] = await sql<{ id: string }[]>`select id from valk.uploads where id = ${question.photo}`;
          photo = upload?.id ?? null;
        }
        if (!photo && resolvePhoto) photo = await resolvePhoto(question.photo, sql);
        if (!photo && match?.photo_upload_id) {
          photo = match.photo_upload_id;
          warnings.push(`${where}: foto "${question.photo}" niet gevonden; de foto die er al bij stond, blijft staan.`);
        } else if (!photo) {
          warnings.push(`${where}: foto "${question.photo}" niet gevonden. Upload hem in de vraageditor.`);
        }
      }
      const extraPhotos: string[] = [];
      if (question.extraPhotos?.length && question.kind !== "kaart") {
        warnings.push(`${where}: extra foto's horen alleen bij een kaartvraag. Ik heb ze overgeslagen.`);
      }
      for (const name of photo && question.kind === "kaart" ? (question.extraPhotos ?? []).slice(0, 4) : []) {
        let found: string | null = null;
        if (isUuid(name)) {
          const [upload] = await sql<{ id: string }[]>`select id from valk.uploads where id = ${name}`;
          found = upload?.id ?? null;
        }
        if (!found && resolvePhoto) found = await resolvePhoto(name, sql);
        if (found && found !== photo && !extraPhotos.includes(found)) extraPhotos.push(found);
        else if (!found) warnings.push(`${where}: extra foto "${name}" niet gevonden. Upload hem in de vraageditor.`);
      }
      if (question.kind === "echt_of_ai" && !photo) warnings.push(`${where}: een Echt of AI-vraag zonder foto. Upload er een in de vraageditor.`);
      if (question.kind === "wie_van_ons" && known.size > 0) {
        const unknown = (question.options ?? []).filter((name) => !known.has(nameKey(name)));
        if (unknown.length > 0) warnings.push(`${where}: ${unknown.join(", ")} staat niet in de deelnemerslijst.`);
      }
      const values = {
        sort: index + 1,
        ext_id: question.extId,
        kind: question.kind,
        text: question.text,
        options: question.options === null ? null : sql.json(question.options),
        correct: sql.json(question.correct as postgres.JSONValue),
        unit: question.unit,
        scale: question.scale,
        explanation: question.explanation,
        photo_upload_id: photo,
        extra_photo_ids: extraPhotos,
        photo_credit: photo ? question.photoCredit : null,
        subjects: sql.json(question.subjects),
        note: question.note,
      };
      if (match && !keep.has(match.id)) {
        keep.add(match.id);
        await sql`
          update valk.quiz_questions set round_id = ${roundId}, sort = ${values.sort}, ext_id = ${values.ext_id},
            kind = ${values.kind}, text = ${values.text}, options = ${values.options}, correct = ${values.correct},
            unit = ${values.unit}, scale = ${values.scale}, explanation = ${values.explanation},
            photo_upload_id = ${values.photo_upload_id}, extra_photo_ids = ${values.extra_photo_ids}::uuid[],
            photo_credit = ${values.photo_credit},
            subjects = ${values.subjects}, note = ${values.note}, updated_at = now()
          where id = ${match.id}
        `;
        changed += 1;
      } else {
        const [row] = await sql<{ id: string }[]>`
          insert into valk.quiz_questions (round_id, sort, ext_id, kind, text, options, correct, unit, scale, explanation,
            photo_upload_id, extra_photo_ids, photo_credit, subjects, note)
          values (${roundId}, ${values.sort}, ${values.ext_id}, ${values.kind}, ${values.text}, ${values.options},
            ${values.correct}, ${values.unit}, ${values.scale}, ${values.explanation}, ${values.photo_upload_id},
            ${values.extra_photo_ids}::uuid[], ${values.photo_credit}, ${values.subjects}, ${values.note})
          returning id
        `;
        keep.add(row.id);
        added += 1;
      }
    }
  }

  const removedQuestions = existingQuestions.filter((q) => !keep.has(q.id)).map((q) => q.id);
  if (removedQuestions.length > 0) await sql`delete from valk.quiz_questions where id in ${sql(removedQuestions)}`;
  const numbers = input.rounds.map((round) => round.number);
  await sql`delete from valk.quiz_rounds where quiz_id = ${quizId} and not (number = any(${numbers}::int[]))`;
  await refreshMaxPoints(sql, roundIds);
  await sql`update valk.quizzes set title = ${input.title}, updated_at = now() where id = ${quizId}`;
  if (known.size === 0 && input.rounds.some((round) => round.questions.some((q) => q.kind === "wie_van_ons"))) {
    warnings.push("De deelnemerslijst is nog leeg, dus de namen bij wie van ons zijn nog niet gecontroleerd.");
  }

  const report: ImportReport = {
    quizId,
    rounds: input.rounds.length,
    questions: input.rounds.reduce((sum, round) => sum + round.questions.length, 0),
    added,
    changed,
    removed: removedQuestions.length,
    warnings,
  };
  await logAudit(
    actor,
    {
      action: "quiz.geimporteerd",
      entity: "quiz",
      entityId: quizId,
      newValue: { titel: input.title, rondes: report.rounds, vragen: report.questions, nieuw: added, gewijzigd: changed, verwijderd: report.removed },
    },
    sql,
  );
  return report;
}

/** Check and write a quiz file (the import in beheer). */
export async function importQuizSource(source: string, actor: Actor): Promise<{ ok: true; report: ImportReport } | { ok: false; errors: string[] }> {
  const parsed = parseQuizFile(source);
  if (!parsed.ok) return parsed;
  try {
    const report = await db().begin((sql) => writeQuiz(sql, parsed.quiz, actor, null));
    return { ok: true, report };
  } catch (error) {
    if (error instanceof QuizEditError) return { ok: false, errors: [error.message] };
    throw error;
  }
}

/** A stored quiz as a quiz file, for the backup. */
export async function exportQuiz(quizId: string): Promise<QuizFile | null> {
  const content = await loadContent(quizId);
  return content ? toQuizFile(content) : null;
}
