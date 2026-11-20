/**
 * Prints the SQL to set a new admin PIN or family code, for emergencies and
 * for the first setup. The PIN or code itself never ends up in the database
 * or in the repo, only its hash (made with the APP_SECRET of production).
 *
 *   APP_SECRET=<uit Vercel> npm run maak-hash -- pin 482913
 *   APP_SECRET=<uit Vercel> npm run maak-hash -- familiecode NIEUWECODE
 *   APP_SECRET=<uit Vercel> npm run maak-hash -- nieuwe-beheerder "Naam" 482913
 *
 * Paste the printed SQL into the Supabase SQL editor of the project.
 */
import { hashSecret } from "../src/lib/server/hashing";
import { familyCodeProblem, normalizeFamilyCode, pinProblem } from "../src/lib/shared/codes";

const [kind, ...args] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function sqlText(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  if (!process.env.APP_SECRET) fail("Zet APP_SECRET (dezelfde waarde als in Vercel).");

  if (kind === "pin") {
    const pin = args[0] ?? "";
    const problem = pinProblem(pin);
    if (problem) fail(problem);
    const hash = await hashSecret("pin-pepper", pin);
    console.log(`update valk.staff set pin_hash = ${sqlText(hash)}, pin_version = pin_version + 1, updated_at = now() where role = 'beheerder';`);
    return;
  }

  if (kind === "familiecode") {
    const code = normalizeFamilyCode(args[0] ?? "");
    const problem = familyCodeProblem(code);
    if (problem) fail(problem);
    const hash = await hashSecret("code-pepper", code);
    console.log(`update valk.family_access set code_hash = ${sqlText(hash)}, updated_at = now(), updated_by = 'noodherstel' where id = 1;`);
    return;
  }

  if (kind === "nieuwe-beheerder") {
    const [name, pin] = args;
    if (!name) fail("Geef een naam.");
    const problem = pinProblem(pin ?? "");
    if (problem) fail(problem);
    const hash = await hashSecret("pin-pepper", pin!);
    console.log(
      `insert into valk.staff (name, role, pin_hash) values (${sqlText(name)}, 'beheerder', ${sqlText(hash)}) ` +
        `on conflict (lower(name), role) do update set pin_hash = excluded.pin_hash, pin_version = valk.staff.pin_version + 1, active = true;`,
    );
    return;
  }

  fail("Gebruik: maak-hash pin <6 cijfers> | familiecode <code> | nieuwe-beheerder <naam> <6 cijfers>");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
