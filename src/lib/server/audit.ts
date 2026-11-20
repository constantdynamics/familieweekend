import "server-only";
import type postgres from "postgres";
import { db } from "./db";

export type Actor = {
  id: string | null;
  name: string;
  role: string;
};

export type AuditEntry = {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

type Sql = postgres.Sql | postgres.TransactionSql;

/** Write one line to the logbook. Pass a transaction to log atomically. */
export async function logAudit(actor: Actor, entry: AuditEntry, sql: Sql = db()): Promise<void> {
  await sql`
    insert into valk.audit_log (actor_id, actor_name, actor_role, action, entity, entity_id, old_value, new_value)
    values (
      ${actor.id}, ${actor.name}, ${actor.role}, ${entry.action},
      ${entry.entity ?? null}, ${entry.entityId ?? null},
      ${entry.oldValue === undefined ? null : sql.json(entry.oldValue as postgres.JSONValue)},
      ${entry.newValue === undefined ? null : sql.json(entry.newValue as postgres.JSONValue)}
    )
  `;
}

export type AuditRow = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
};

export async function listAudit(limit = 50, beforeId?: number): Promise<AuditRow[]> {
  const rows = await db()<
    {
      id: string;
      actor_name: string;
      actor_role: string;
      action: string;
      entity: string | null;
      old_value: unknown;
      new_value: unknown;
      created_at: Date;
    }[]
  >`
    select id, actor_name, actor_role, action, entity, old_value, new_value, created_at
    from valk.audit_log
    where env = 'live' ${beforeId ? db()`and id < ${beforeId}` : db()``}
    order by id desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entity: row.entity,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at.toISOString(),
  }));
}
