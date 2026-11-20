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
