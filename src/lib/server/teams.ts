import "server-only";
import type { Sql } from "postgres";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { hashSecret, verifySecret } from "./hashing";
import type { Env } from "./tokens";

import { TEAM_COLORS, type TeamColor } from "@/lib/shared/teams";

export { TEAM_COLORS, type TeamColor };

export type Team = {
  id: string;
  env: Env;
  name: string;
  color: TeamColor;
  sort: number;
  hasPin: boolean;
  activeDeviceId: string | null;
  activeSince: string | null;
};

type Row = {
  id: string;
  env: Env;
  name: string;
  color: TeamColor;
  sort: number;
  pin_hash: string | null;
  pin_version: number;
  active_device_id: string | null;
  active_since: Date | null;
};

function toTeam(row: Row): Team {
  return {
    id: row.id,
    env: row.env,
    name: row.name,
    color: row.color,
    sort: row.sort,
    hasPin: row.pin_hash !== null,
    activeDeviceId: row.active_device_id,
    activeSince: row.active_since?.toISOString() ?? null,
  };
}

export async function listTeams(env: Env, sql: Sql = db()): Promise<Team[]> {
  const rows = await sql<Row[]>`select * from valk.teams where env = ${env} order by sort, name`;
  return rows.map(toTeam);
}

export async function getTeam(env: Env, id: string, sql: Sql = db()): Promise<Team | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<Row[]>`select * from valk.teams where env = ${env} and id = ${id}`;
  return row ? toTeam(row) : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type TeamInput = { name: string; color: TeamColor; sort: number };

export async function updateTeam(env: Env, id: string, input: TeamInput, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [before] = await sql<Row[]>`select * from valk.teams where env = ${env} and id = ${id} for update`;
    if (!before) throw new Error("Dit team bestaat niet meer.");
    await sql`
      update valk.teams set name = ${input.name}, color = ${input.color}, sort = ${input.sort}, updated_at = now()
      where id = ${id}
    `;
    await logAudit(
      actor,
      {
        action: "team.gewijzigd",
        entity: "team",
        entityId: id,
        oldValue: { naam: before.name, kleur: before.color, volgorde: before.sort },
        newValue: { naam: input.name, kleur: input.color, volgorde: input.sort },
      },
      sql,
      env,
    );
  });
}

export async function addTeam(env: Env, input: TeamInput, actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into valk.teams (env, name, color, sort) values (${env}, ${input.name}, ${input.color}, ${input.sort})
      returning id
    `;
    await logAudit(actor, { action: "team.toegevoegd", entity: "team", entityId: row.id, newValue: { naam: input.name } }, sql, env);
    return row.id;
  });
}

export async function deleteTeam(env: Env, id: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`delete from valk.teams where env = ${env} and id = ${id} returning name`;
    if (row) await logAudit(actor, { action: "team.verwijderd", entity: "team", entityId: id, oldValue: { naam: row.name } }, sql, env);
  });
}

/** A new team PIN: the old captain device is logged out. The PIN is never stored. */
export async function setTeamPin(env: Env, id: string, pin: string, actor: Actor): Promise<void> {
  const hash = await hashSecret("pin-pepper", pin);
  await db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`
      update valk.teams
      set pin_hash = ${hash}, pin_version = pin_version + 1, active_device_id = null, active_since = null, updated_at = now()
      where env = ${env} and id = ${id}
      returning name
    `;
    if (!row) throw new Error("Dit team bestaat niet meer.");
    await logAudit(actor, { action: "teampin.gemaakt", entity: "team", entityId: id, newValue: { team: row.name } }, sql, env);
  });
}

export type TeamPinMatch = { id: string; name: string; pinVersion: number };

/** The team in this environment whose PIN matches, if any. */
export async function findTeamByPin(env: Env, pin: string): Promise<TeamPinMatch | null> {
  const rows = await db()<Row[]>`select * from valk.teams where env = ${env} and pin_hash is not null order by sort`;
  for (const row of rows) {
    if (await verifySecret("pin-pepper", pin, row.pin_hash)) {
      return { id: row.id, name: row.name, pinVersion: row.pin_version };
    }
  }
  return null;
}

/**
 * This device becomes the team device. An earlier device loses its role and
 * sees "Je teamtoestel is overgenomen door een ander toestel."
 */
export async function takeCaptainDevice(env: Env, teamId: string, deviceId: string): Promise<{ tookOver: boolean }> {
  const [row] = await db()<{ previous: string | null }[]>`
    update valk.teams t
    set active_device_id = ${deviceId}, active_since = now(), updated_at = now()
    from (select active_device_id as previous from valk.teams where env = ${env} and id = ${teamId} for update) p
    where t.env = ${env} and t.id = ${teamId}
    returning p.previous
  `;
  return { tookOver: Boolean(row?.previous && row.previous !== deviceId) };
}

export async function teamPinVersion(env: Env, teamId: string): Promise<{ pinVersion: number; activeDeviceId: string | null } | null> {
  const [row] = await db()<{ pin_version: number; active_device_id: string | null }[]>`
    select pin_version, active_device_id from valk.teams where env = ${env} and id = ${teamId}
  `;
  return row ? { pinVersion: row.pin_version, activeDeviceId: row.active_device_id } : null;
}
