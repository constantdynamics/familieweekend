/**
 * Apply the SQL files in supabase/migrations in order, once each.
 *
 *   MIGRATION_DATABASE_URL=postgres://postgres:…@host:5432/postgres npm run db:migrate
 *
 * Each migration records itself in valk.schema_migrations (also when it is
 * applied through the Supabase MCP or the SQL editor), so this script and the
 * remote project agree on what has been applied.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("Zet MIGRATION_DATABASE_URL (een gebruiker die tabellen mag aanmaken, bijv. postgres).");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
});

async function applied(): Promise<Set<string>> {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select to_regclass('valk.schema_migrations') is not null as exists
  `;
  if (!exists) return new Set();
  const rows = await sql<{ version: string }[]>`select version from valk.schema_migrations`;
  return new Set(rows.map((r) => r.version));
}

async function main() {
  const files = (await readdir(dir)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  const done = await applied();
  let count = 0;
  for (const file of files) {
    const version = file.slice(0, 14);
    if (done.has(version)) continue;
    const name = file.slice(15, -4);
    const body = await readFile(path.join(dir, file), "utf8");
    process.stdout.write(`→ ${file} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        insert into valk.schema_migrations (version, name) values (${version}, ${name})
        on conflict (version) do nothing
      `;
    });
    console.log("klaar");
    count += 1;
  }
  console.log(count === 0 ? "Alle migraties waren al toegepast." : `${count} migratie(s) toegepast.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
