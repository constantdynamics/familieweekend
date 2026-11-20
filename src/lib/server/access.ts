import "server-only";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { hashSecret, verifySecret } from "./hashing";
import type { StaffRole } from "./tokens";

/** True when the (normalised) code matches the stored family code. */
export async function checkFamilyCode(code: string): Promise<boolean> {
  const [row] = await db()<{ code_hash: string | null }[]>`
    select code_hash from valk.family_access where id = 1
  `;
  return verifySecret("code-pepper", code, row?.code_hash);
}

export async function familyCodeIsSet(): Promise<boolean> {
  const [row] = await db()<{ set: boolean }[]>`
    select code_hash is not null as set from valk.family_access where id = 1
  `;
  return Boolean(row?.set);
}

export async function setFamilyCode(code: string, actor: Actor): Promise<void> {
  const hash = await hashSecret("code-pepper", code);
  await db().begin(async (sql) => {
    await sql`
      update valk.family_access
      set code_hash = ${hash}, updated_at = now(), updated_by = ${actor.name}
      where id = 1
    `;
    await logAudit(actor, { action: "familiecode.gewijzigd", entity: "familiecode" }, sql);
  });
}

export type StaffMatch = {
  id: string;
  name: string;
  role: StaffRole;
  pinVersion: number;
};

/** Find the active staff member with this role whose PIN matches. */
export async function findStaffByPin(role: StaffRole, pin: string): Promise<StaffMatch | null> {
  const rows = await db()<{ id: string; name: string; role: StaffRole; pin_hash: string | null; pin_version: number }[]>`
    select id, name, role, pin_hash, pin_version
    from valk.staff
    where role = ${role} and active and pin_hash is not null
    order by created_at
  `;
  for (const row of rows) {
    if (await verifySecret("pin-pepper", pin, row.pin_hash)) {
      return { id: row.id, name: row.name, role: row.role, pinVersion: row.pin_version };
    }
  }
  return null;
}

export async function verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const [row] = await db()<{ pin_hash: string | null }[]>`
    select pin_hash from valk.staff where id = ${staffId} and active
  `;
  return verifySecret("pin-pepper", pin, row?.pin_hash);
}

/** Set a new PIN. Returns the new pin_version (older logins stop working). */
export async function changeStaffPin(staffId: string, pin: string, actor: Actor): Promise<number> {
  const hash = await hashSecret("pin-pepper", pin);
  return db().begin(async (sql) => {
    const [row] = await sql<{ pin_version: number; name: string }[]>`
      update valk.staff
      set pin_hash = ${hash}, pin_version = pin_version + 1, updated_at = now()
      where id = ${staffId}
      returning pin_version, name
    `;
    if (!row) throw new Error("Deze gebruiker bestaat niet meer.");
    await logAudit(
      actor,
      { action: "pin.gewijzigd", entity: "staff", entityId: staffId, newValue: { naam: row.name } },
      sql,
    );
    return row.pin_version;
  });
}

/* ------------------------------------------------------------------------ */
/* Spelleiders: each has an own PIN, linked to a name (SPEC §3).             */
/* ------------------------------------------------------------------------ */

export type StaffMember = { id: string; name: string; role: StaffRole; hasPin: boolean; active: boolean };

export async function listStaff(role: StaffRole): Promise<StaffMember[]> {
  const rows = await db()<{ id: string; name: string; role: StaffRole; pin_hash: string | null; active: boolean }[]>`
    select id, name, role, pin_hash, active from valk.staff where role = ${role} order by active desc, lower(name)
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, hasPin: r.pin_hash !== null, active: r.active }));
}

/** Add a spelleider with a fresh PIN (shown once to the admin). */
export async function addSpelleider(name: string, pin: string, actor: Actor): Promise<string> {
  const hash = await hashSecret("pin-pepper", pin);
  return db().begin(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into valk.staff (name, role, pin_hash) values (${name}, 'spelleider', ${hash})
      on conflict (lower(name), role) do update set pin_hash = excluded.pin_hash, pin_version = valk.staff.pin_version + 1, active = true
      returning id
    `;
    await logAudit(actor, { action: "spelleider.toegevoegd", entity: "staff", entityId: row.id, newValue: { naam: name } }, sql);
    return row.id;
  });
}

export async function resetSpelleiderPin(staffId: string, pin: string, actor: Actor): Promise<string> {
  const hash = await hashSecret("pin-pepper", pin);
  return db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`
      update valk.staff set pin_hash = ${hash}, pin_version = pin_version + 1, active = true, updated_at = now()
      where id = ${staffId} and role = 'spelleider'
      returning name
    `;
    if (!row) throw new Error("Deze spelleider bestaat niet meer.");
    await logAudit(actor, { action: "spelleider.pin", entity: "staff", entityId: staffId, newValue: { naam: row.name } }, sql);
    return row.name;
  });
}

export async function stopSpelleider(staffId: string, actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ name: string }[]>`
      update valk.staff set active = false, pin_version = pin_version + 1, updated_at = now()
      where id = ${staffId} and role = 'spelleider'
      returning name
    `;
    if (row) await logAudit(actor, { action: "spelleider.gestopt", entity: "staff", entityId: staffId, oldValue: { naam: row.name } }, sql);
  });
}
