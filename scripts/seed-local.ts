/**
 * Local development and test data. Refuses to touch anything but localhost.
 *
 *   APP_SECRET=… MIGRATION_DATABASE_URL=postgres://postgres:postgres@localhost:5432/valk_dev \
 *   VALK_APP_PASSWORD=… SEED_FAMILY_CODE=… SEED_ADMIN_PIN=… npm run db:seed
 *
 * Run with `--conditions=react-server` (the npm script does that), because
 * the hashing module is server-only.
 */
import postgres from "postgres";
import { hashSecret } from "../src/lib/server/hashing";
import { normalizeFamilyCode } from "../src/lib/shared/codes";

const url = process.env.MIGRATION_DATABASE_URL;
const appPassword = process.env.VALK_APP_PASSWORD;
const familyCode = process.env.SEED_FAMILY_CODE;
const adminPin = process.env.SEED_ADMIN_PIN;
const adminName = process.env.SEED_ADMIN_NAME ?? "Beheerder";

if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Dit script draait alleen tegen een lokale database (localhost).");
  process.exit(1);
}
if (!appPassword || !familyCode || !adminPin || !process.env.APP_SECRET) {
  console.error("Zet APP_SECRET, VALK_APP_PASSWORD, SEED_FAMILY_CODE en SEED_ADMIN_PIN.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  await sql.unsafe(`alter role valk_app password '${appPassword!.replace(/'/g, "''")}'`);
  const codeHash = await hashSecret("code-pepper", normalizeFamilyCode(familyCode));
  const pinHash = await hashSecret("pin-pepper", adminPin!);
  await sql`update valk.family_access set code_hash = ${codeHash}, updated_at = now(), updated_by = 'seed' where id = 1`;
  await sql`
    insert into valk.staff (name, role, pin_hash)
    values (${adminName}, 'beheerder', ${pinHash})
    on conflict (lower(name), role) do update set pin_hash = excluded.pin_hash, pin_version = valk.staff.pin_version + 1, active = true
  `;
  if (process.env.SEED_RESET === "1") {
    await sql`delete from valk.login_attempts`;
    await sql`delete from valk.audit_log`;
    await sql`
      update valk.settings set
        start_at = '2027-05-06 14:00:00+02', end_at = '2027-05-09 15:00:00+02',
        location_name = 'De Dommelvallei', location_place = 'Borkel en Schaft',
        latitude = 51.2975, longitude = 5.4417, funfacts_deadline = '2027-04-01 23:59:59+02'
      where id = 1
    `;
  }
  console.log("Lokale gegevens klaar.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
