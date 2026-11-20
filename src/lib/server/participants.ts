import "server-only";
import type { Sql } from "postgres";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { isUuid } from "./teams";
import type { Env } from "./tokens";

export type Participant = {
  id: string;
  env: Env;
  name: string;
  nickname: string | null;
  /** What the app calls you: the nickname, or else the name. */
  displayName: string;
  teamId: string | null;
  isChild: boolean;
  isCaptain: boolean;
  claimed: boolean;
  claimedAt: string | null;
  funfactsDoneAt: string | null;
  sort: number;
};

type Row = {
  id: string;
  env: Env;
  name: string;
  nickname: string | null;
  team_id: string | null;
  is_child: boolean;
  is_captain: boolean;
  claimed_device_id: string | null;
  claimed_at: Date | null;
  funfacts_done_at: Date | null;
  sort: number;
};

function toParticipant(row: Row): Participant {
  return {
    id: row.id,
    env: row.env,
    name: row.name,
    nickname: row.nickname,
    displayName: row.nickname?.trim() || row.name,
    teamId: row.team_id,
    isChild: row.is_child,
    isCaptain: row.is_captain,
    claimed: row.claimed_device_id !== null,
    claimedAt: row.claimed_at?.toISOString() ?? null,
    funfactsDoneAt: row.funfacts_done_at?.toISOString() ?? null,
    sort: row.sort,
  };
}

export async function listParticipants(env: Env, sql: Sql = db()): Promise<Participant[]> {
  const rows = await sql<Row[]>`select * from valk.participants where env = ${env} order by lower(name)`;
  return rows.map(toParticipant);
}

export async function getParticipant(env: Env, id: string, sql: Sql = db()): Promise<Participant | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<Row[]>`select * from valk.participants where env = ${env} and id = ${id}`;
  return row ? toParticipant(row) : null;
}

/** The names this device chose ("Ik vul ook in voor…" gives more than one). */
export async function participantsForDevice(env: Env, deviceId: string): Promise<Participant[]> {
  const rows = await db()<Row[]>`
    select * from valk.participants
    where env = ${env} and claimed_device_id = ${deviceId}
    order by claimed_at, lower(name)
  `;
  return rows.map(toParticipant);
}

export type ClaimResult = "gekoppeld" | "al-van-jou" | "bezet" | "onbekend";

/**
 * Link a name to this device. A name belongs to one device only, so nobody
 * can use someone else's name (SPEC §3).
 */
export async function claimParticipant(env: Env, participantId: string, deviceId: string): Promise<ClaimResult> {
  if (!isUuid(participantId)) return "onbekend";
  return db().begin(async (sql) => {
    const [row] = await sql<{ claimed_device_id: string | null }[]>`
      select claimed_device_id from valk.participants where env = ${env} and id = ${participantId} for update
    `;
    if (!row) return "onbekend";
    if (row.claimed_device_id === deviceId) return "al-van-jou";
    if (row.claimed_device_id !== null) return "bezet";
    await sql`
      update valk.participants set claimed_device_id = ${deviceId}, claimed_at = now(), updated_at = now()
      where id = ${participantId}
    `;
    return "gekoppeld";
  });
}

/** The device lets go of one of its own names. */
export async function unclaimOwn(env: Env, participantId: string, deviceId: string): Promise<boolean> {
  if (!isUuid(participantId)) return false;
  const rows = await db()`
    update valk.participants set claimed_device_id = null, claimed_at = null, updated_at = now()
    where env = ${env} and id = ${participantId} and claimed_device_id = ${deviceId}
    returning id
  `;
  return rows.length > 0;
}

/** The admin frees a name, for example when someone got a new phone. */
export async function releaseParticipant(env: Env, participantId: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`
      update valk.participants set claimed_device_id = null, claimed_at = null, updated_at = now()
      where env = ${env} and id = ${participantId}
      returning name
    `;
    if (row) {
      await logAudit(actor, { action: "naam.vrijgegeven", entity: "deelnemer", entityId: participantId, newValue: { naam: row.name } }, sql, env);
    }
  });
}

export type ParticipantInput = {
  name: string;
  nickname: string | null;
  teamId: string | null;
  isChild: boolean;
  isCaptain: boolean;
};

export async function addParticipant(env: Env, input: ParticipantInput, actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into valk.participants (env, name, nickname, team_id, is_child, is_captain)
      values (${env}, ${input.name}, ${input.nickname}, ${input.teamId}, ${input.isChild}, ${input.isCaptain})
      returning id
    `;
    await logAudit(actor, { action: "deelnemer.toegevoegd", entity: "deelnemer", entityId: row.id, newValue: { naam: input.name } }, sql, env);
    return row.id;
  });
}

export async function updateParticipant(env: Env, id: string, input: ParticipantInput, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [before] = await sql<Row[]>`select * from valk.participants where env = ${env} and id = ${id} for update`;
    if (!before) throw new Error("Deze deelnemer bestaat niet meer.");
    await sql`
      update valk.participants set
        name = ${input.name}, nickname = ${input.nickname}, team_id = ${input.teamId},
        is_child = ${input.isChild}, is_captain = ${input.isCaptain}, updated_at = now()
      where id = ${id}
    `;
    await logAudit(
      actor,
      {
        action: "deelnemer.gewijzigd",
        entity: "deelnemer",
        entityId: id,
        oldValue: { naam: before.name, roepnaam: before.nickname, team: before.team_id, kind: before.is_child, captain: before.is_captain },
        newValue: { naam: input.name, roepnaam: input.nickname, team: input.teamId, kind: input.isChild, captain: input.isCaptain },
      },
      sql,
      env,
    );
  });
}

export async function deleteParticipant(env: Env, id: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`delete from valk.participants where env = ${env} and id = ${id} returning name`;
    if (row) await logAudit(actor, { action: "deelnemer.verwijderd", entity: "deelnemer", entityId: id, oldValue: { naam: row.name } }, sql, env);
  });
}

/**
 * Add a pasted list: one name per line. Names that already exist are
 * skipped. Returns how many were added and which were skipped.
 */
export async function importParticipants(
  env: Env,
  names: string[],
  teamId: string | null,
  actor: Actor,
): Promise<{ added: string[]; skipped: string[] }> {
  return db().begin(async (sql) => {
    const existing = new Set(
      (await sql<{ name: string }[]>`select name from valk.participants where env = ${env}`).map((r) => r.name.toLowerCase()),
    );
    const added: string[] = [];
    const skipped: string[] = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (existing.has(key)) {
        skipped.push(name);
        continue;
      }
      existing.add(key);
      await sql`insert into valk.participants (env, name, team_id) values (${env}, ${name}, ${teamId})`;
      added.push(name);
    }
    if (added.length > 0) {
      await logAudit(actor, { action: "deelnemers.geplakt", entity: "deelnemer", newValue: { aantal: added.length, namen: added } }, sql, env);
    }
    return { added, skipped };
  });
}

/** Clean a pasted list: trim, drop empty lines, numbering and bullets, and duplicates. */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const name = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
