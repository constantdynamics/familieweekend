import "server-only";
import { autoSubjects, fairnessCheck } from "@/lib/shared/fairness";
import type { QuestionType } from "@/lib/shared/quizScoring";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { readSettings } from "./settings";

/**
 * The checklist for the admin and the spelleiders: what still has to happen
 * before the Spelen. Items with an auto_key are checked by the app itself
 * (it can see the data); the others are ticked by hand. Everyone of the
 * staff can add notes, with their name.
 */

export type ChecklistNote = { id: string; author: string; role: string; body: string; createdAt: string };

export type ChecklistItem = {
  id: string;
  title: string;
  detail: string | null;
  auto: boolean;
  done: boolean;
  /** For automatic items: what the app sees, e.g. "32 van de 45". */
  status: string | null;
  doneBy: string | null;
  doneAt: string | null;
  notes: ChecklistNote[];
};

type AutoResult = { done: boolean; status: string | null };

async function autoChecks(): Promise<Record<string, AutoResult>> {
  const sql = db();
  const settings = await readSettings();
  const [counts] = await sql<
    {
      code: boolean;
      pin_changed: boolean;
      names: number;
      without_team: number;
      done_funfacts: number;
      teams: number;
      teams_with_captain: number;
      teams_with_pin: number;
      spelleiders: number;
    }[]
  >`
    select
      (select code_hash is not null from valk.family_access where id = 1) as code,
      exists (select 1 from valk.staff where role = 'beheerder' and active and pin_version > 1) as pin_changed,
      (select count(*)::int from valk.participants where env = 'live') as names,
      (select count(*)::int from valk.participants where env = 'live' and team_id is null) as without_team,
      (select count(*)::int from valk.participants where env = 'live' and funfacts_done_at is not null) as done_funfacts,
      (select count(*)::int from valk.teams where env = 'live') as teams,
      (select count(distinct t.id)::int from valk.teams t join valk.participants p on p.team_id = t.id and p.is_captain where t.env = 'live') as teams_with_captain,
      (select count(*)::int from valk.teams where env = 'live' and pin_hash is not null) as teams_with_pin,
      (select count(*)::int from valk.staff where role = 'spelleider' and active and pin_hash is not null) as spelleiders
  `;
  const quiz = await quizState();
  const now = Date.now();
  const open = Date.parse(settings.funfactsOpenAt);
  return {
    familiecode: { done: counts.code, status: null },
    nieuwe_app: { done: settings.fase2Live, status: settings.fase2Live ? "staat aan" : "staat nog uit" },
    eigen_pin: { done: counts.pin_changed, status: null },
    deelnemers: { done: counts.names >= 10, status: counts.names === 1 ? "1 naam" : `${counts.names} namen` },
    teams_ingedeeld: {
      done: counts.names > 0 && counts.without_team === 0,
      status: counts.names === 0 ? null : counts.without_team === 0 ? "iedereen zit in een team" : `${counts.without_team} nog zonder team`,
    },
    captains: { done: counts.teams > 0 && counts.teams_with_captain === counts.teams, status: `${counts.teams_with_captain} van ${counts.teams} teams` },
    team_pins: { done: counts.teams > 0 && counts.teams_with_pin === counts.teams, status: `${counts.teams_with_pin} van ${counts.teams} teams` },
    spelleiders: { done: counts.spelleiders >= 6, status: `${counts.spelleiders} van ongeveer 6` },
    funfacts_open: { done: now >= open, status: null },
    funfacts_klaar: {
      done: counts.names > 0 && counts.done_funfacts === counts.names,
      status: counts.names === 0 ? null : `${counts.done_funfacts} van de ${counts.names} klaar`,
    },
    programma: { done: settings.programVisible, status: settings.programVisible ? "zichtbaar" : "nog niet zichtbaar" },
    quiz_geimporteerd: { done: quiz.questions >= 40, status: quiz.questions === 1 ? "1 vraag" : `${quiz.questions} vragen` },
    eerlijkheid: { done: quiz.questions > 0 && quiz.fair, status: quiz.questions === 0 ? null : quiz.fair ? "in orde" : "kijk bij de quiz" },
  };
}

/** The real quiz (not the demo): number of questions, and whether the fairness check passes. */
async function quizState(): Promise<{ questions: number; fair: boolean }> {
  const sql = db();
  const rows = await sql<
    { round: number; kind: QuestionType; options: unknown; correct: unknown; subjects: unknown; submitter: string | null }[]
  >`
    select r.number as round, q.kind, q.options, q.correct, q.subjects,
           (select coalesce(nullif(trim(p.nickname), ''), p.name) from valk.uploads u
              join valk.participants p on p.id = u.participant_id
            where u.id = coalesce((select o.original_id from valk.uploads o where o.id = q.photo_upload_id), q.photo_upload_id)) as submitter
    from valk.quiz_questions q
    join valk.quiz_rounds r on r.id = q.round_id
    join valk.quizzes z on z.id = r.quiz_id and not z.is_demo
  `;
  if (rows.length === 0) return { questions: 0, fair: false };
  const people = await sql<{ name: string; team: string | null }[]>`
    select name, team_id as team from valk.participants where env = 'live'
  `;
  const teamOf: Record<string, string> = {};
  for (const p of people) if (p.team) teamOf[p.name] = p.team;
  const teams = [...new Set(Object.values(teamOf))];
  const questions = rows.map((row) => {
    const options = Array.isArray(row.options) ? (row.options as string[]) : [];
    return {
      round: row.round,
      subjects: autoSubjects({
        type: row.kind,
        options: options.map((name) => ({ participantId: name })),
        correct: typeof row.correct === "number" ? row.correct : null,
        submitterId: row.submitter,
        subjects: Array.isArray(row.subjects) ? (row.subjects as string[]) : [],
      }),
    };
  });
  const report = fairnessCheck(questions, teamOf, teams);
  return { questions: rows.length, fair: report.warnings.length === 0 };
}

export async function listChecklist(): Promise<ChecklistItem[]> {
  const sql = db();
  const [items, notes, auto] = await Promise.all([
    sql<
      { id: string; title: string; detail: string | null; auto_key: string | null; done: boolean; done_by: string | null; done_at: Date | null }[]
    >`select id, title, detail, auto_key, done, done_by, done_at from valk.checklist_items order by sort, created_at`,
    sql<{ id: string; item_id: string; author_name: string; author_role: string; body: string; created_at: Date }[]>`
      select id, item_id, author_name, author_role, body, created_at from valk.checklist_notes order by created_at
    `,
    autoChecks(),
  ]);
  return items.map((item) => {
    const check = item.auto_key ? auto[item.auto_key] : undefined;
    return {
      id: item.id,
      title: item.title,
      detail: item.detail,
      auto: Boolean(check),
      done: check ? check.done : item.done,
      status: check?.status ?? null,
      doneBy: check ? null : item.done_by,
      doneAt: check ? null : (item.done_at?.toISOString() ?? null),
      notes: notes
        .filter((n) => n.item_id === item.id)
        .map((n) => ({ id: n.id, author: n.author_name, role: n.author_role, body: n.body, createdAt: n.created_at.toISOString() })),
    };
  });
}

export async function setItemDone(id: string, done: boolean, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ title: string }[]>`
      update valk.checklist_items
      set done = ${done}, done_at = ${done ? sql`now()` : null}, done_by = ${done ? actor.name : null}, updated_at = now()
      where id = ${id} and auto_key is null
      returning title
    `;
    if (row) {
      await logAudit(actor, { action: "afvinklijst.vinkje", entity: "afvinklijst", entityId: id, newValue: { punt: row.title, af: done } }, sql);
    }
  });
}

export async function addItem(title: string, detail: string | null, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    await sql`
      insert into valk.checklist_items (title, detail, sort)
      values (${title}, ${detail}, (select coalesce(max(sort), 0) + 1 from valk.checklist_items))
    `;
    await logAudit(actor, { action: "afvinklijst.vinkje", entity: "afvinklijst", newValue: { punt: title, toegevoegd: true } }, sql);
  });
}

export async function deleteItem(id: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ title: string }[]>`
      delete from valk.checklist_items where id = ${id} and auto_key is null returning title
    `;
    if (row) {
      await logAudit(actor, { action: "afvinklijst.vinkje", entity: "afvinklijst", entityId: id, oldValue: { punt: row.title } }, sql);
    }
  });
}

export async function addNote(itemId: string, body: string, author: { name: string; role: "beheerder" | "spelleider" }): Promise<void> {
  await db()`
    insert into valk.checklist_notes (item_id, author_name, author_role, body)
    values (${itemId}, ${author.name}, ${author.role}, ${body})
  `;
}

/** Your own note, or any note for the admin. */
export async function deleteNote(noteId: string, author: { name: string; role: "beheerder" | "spelleider" }): Promise<void> {
  if (author.role === "beheerder") {
    await db()`delete from valk.checklist_notes where id = ${noteId}`;
  } else {
    await db()`delete from valk.checklist_notes where id = ${noteId} and author_name = ${author.name} and author_role = 'spelleider'`;
  }
}
