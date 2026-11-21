import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { programDays, type ProgramInput, type ProgramItem, type ProgramKind, type ProgramView } from "@/lib/shared/program";
import { logAudit, type Actor } from "./audit";
import type { RequestContext } from "./context";
import { db } from "./db";
import { ring } from "./live";
import type { Settings } from "./settings";
import { isUuid } from "./teams";

/**
 * The program of the weekend (SPEC §4.3). One program for the real Spelen
 * and the test environment alike, so every change rings both doorbells and
 * is logged in the real logbook.
 */

type Row = {
  id: string;
  starts_at: Date;
  ends_at: Date | null;
  title: string;
  subtitle: string | null;
  location: string | null;
  kind: ProgramKind;
  sort: number;
};

function toItem(row: Row): ProgramItem {
  return {
    id: row.id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
    title: row.title,
    subtitle: row.subtitle,
    location: row.location,
    kind: row.kind,
    sort: row.sort,
  };
}

export async function listProgram(sql: Sql = db()): Promise<ProgramItem[]> {
  const rows = await sql<Row[]>`
    select id, starts_at, ends_at, title, subtitle, location, kind, sort
    from valk.program_items
    order by starts_at, sort, lower(title)
  `;
  return rows.map(toItem);
}

export async function getProgramItem(id: string): Promise<ProgramItem | null> {
  if (!isUuid(id)) return null;
  const [row] = await db()<Row[]>`
    select id, starts_at, ends_at, title, subtitle, location, kind, sort
    from valk.program_items where id = ${id}
  `;
  return row ? toItem(row) : null;
}

/** What the logbook keeps of an item: readable, without ids. */
function logValue(item: { title: string; startsAt: Date | string; endsAt: Date | string | null; subtitle: string | null; location: string | null; kind: string }) {
  const iso = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString());
  return {
    titel: item.title,
    begin: iso(item.startsAt),
    eind: iso(item.endsAt),
    ondertitel: item.subtitle,
    plek: item.location,
    soort: item.kind,
  };
}

/** New items go last among the items that start at the same moment. */
async function nextSort(sql: Sql | TransactionSql, startsAt: Date, exceptId: string | null): Promise<number> {
  const [row] = await sql<{ next: number }[]>`
    select coalesce(max(sort), 0)::int + 1 as next from valk.program_items
    where starts_at = ${startsAt} and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)
  `;
  return row?.next ?? 1;
}

export async function addProgramItem(input: ProgramInput, actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    const sort = await nextSort(sql, input.startsAt, null);
    const [row] = await sql<{ id: string }[]>`
      insert into valk.program_items (starts_at, ends_at, title, subtitle, location, kind, sort)
      values (${input.startsAt}, ${input.endsAt}, ${input.title}, ${input.subtitle}, ${input.location}, ${input.kind}, ${sort})
      returning id
    `;
    await logAudit(
      actor,
      { action: "programma.toegevoegd", entity: "programma", entityId: row.id, newValue: logValue(input) },
      sql,
    );
    return row.id;
  });
}

/** Returns false when the item no longer exists. */
export async function updateProgramItem(id: string, input: ProgramInput, actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  return db().begin(async (sql) => {
    const [before] = await sql<Row[]>`select * from valk.program_items where id = ${id} for update`;
    if (!before) return false;
    const moved = before.starts_at.getTime() !== input.startsAt.getTime();
    const sort = moved ? await nextSort(sql, input.startsAt, id) : before.sort;
    await sql`
      update valk.program_items set
        starts_at = ${input.startsAt}, ends_at = ${input.endsAt}, title = ${input.title},
        subtitle = ${input.subtitle}, location = ${input.location}, kind = ${input.kind},
        sort = ${sort}, updated_at = now()
      where id = ${id}
    `;
    await logAudit(
      actor,
      {
        action: "programma.gewijzigd",
        entity: "programma",
        entityId: id,
        oldValue: logValue({ ...before, startsAt: before.starts_at, endsAt: before.ends_at }),
        newValue: logValue(input),
      },
      sql,
    );
    return true;
  });
}

export async function deleteProgramItem(id: string, actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  return db().begin(async (sql) => {
    const [row] = await sql<Row[]>`delete from valk.program_items where id = ${id} returning *`;
    if (!row) return false;
    await logAudit(
      actor,
      {
        action: "programma.verwijderd",
        entity: "programma",
        entityId: id,
        oldValue: logValue({ ...row, startsAt: row.starts_at, endsAt: row.ends_at }),
      },
      sql,
    );
    return true;
  });
}

/**
 * Move an item one place up or down. The program is ordered by time, so this
 * only swaps items that start at the same moment. Returns false when there is
 * nothing to swap with.
 */
export async function moveProgramItem(id: string, direction: "omhoog" | "omlaag", actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  return db().begin(async (sql) => {
    const [item] = await sql<Row[]>`select * from valk.program_items where id = ${id} for update`;
    if (!item) return false;
    const group = await sql<Row[]>`
      select * from valk.program_items where starts_at = ${item.starts_at}
      order by sort, lower(title)
      for update
    `;
    const from = group.findIndex((row) => row.id === id);
    const to = direction === "omhoog" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= group.length) return false;
    const order = group.map((row) => row.id);
    [order[from], order[to]] = [order[to], order[from]];
    for (const [index, rowId] of order.entries()) {
      await sql`update valk.program_items set sort = ${index + 1}, updated_at = now() where id = ${rowId}`;
    }
    await logAudit(
      actor,
      {
        action: "programma.gewijzigd",
        entity: "programma",
        entityId: id,
        oldValue: { titel: item.title, volgorde: from + 1 },
        newValue: { titel: item.title, volgorde: to + 1 },
      },
      sql,
    );
    return true;
  });
}

/** Phones in the real Spelen and in the test environment both show the program. */
export async function ringProgram(): Promise<void> {
  await Promise.all([ring("live"), ring("test")]);
}

/**
 * The family sees the program once the admin releases it (and the new app is
 * live); the admin always sees it.
 */
export async function programView(ctx: Pick<RequestContext, "isAdmin">, settings: Settings): Promise<ProgramView> {
  const familieZiet = settings.programVisible && settings.fase2Live;
  const toon = familieZiet || ctx.isAdmin;
  if (!toon) return { toon, familieZiet, items: [], days: [] };
  const items = await listProgram();
  return { toon, familieZiet, items, days: programDays(items, settings.startAt, settings.endAt) };
}
