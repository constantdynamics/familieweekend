/**
 * Runs the migrations against the local test database and checks the
 * security promises of SPEC §7.2: RLS on every table, deny by default,
 * and only the server role (valk_app) gets in.
 *
 * Needs a local Postgres (see README). Override with TEST_ADMIN_DATABASE_URL.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/valk_test";
const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });

beforeAll(() => {
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: adminUrl },
    stdio: "pipe",
  });
}, 60_000);

afterAll(async () => {
  await sql.end();
});

async function asRole<T>(role: string, run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    return run(tx);
  });
}

describe("database", () => {
  it("heeft rij-beveiliging aan op elke tabel in het valk-schema", async () => {
    const tables = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'valk' and c.relkind = 'r'
    `;
    expect(tables.length).toBeGreaterThanOrEqual(7);
    for (const table of tables) expect(table.relrowsecurity, table.relname).toBe(true);
  });

  it("laat de standaardrollen van Supabase nergens bij", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, (tx) => tx`select * from valk.settings`)).rejects.toThrow(/permission denied/);
      await expect(asRole(role, (tx) => tx`select * from valk.staff`)).rejects.toThrow(/permission denied/);
    }
  });

  it("geeft de serverrol toegang, maar laat hem de migratielijst niet wijzigen", async () => {
    const rows = await asRole("valk_app", (tx) => tx`select location_name from valk.settings where id = 1`);
    expect(rows[0].location_name).toBe("De Dommelvallei");
    await expect(
      asRole("valk_app", (tx) => tx`insert into valk.schema_migrations (version, name) values ('x', 'x')`),
    ).rejects.toThrow(/permission denied/);
    await expect(asRole("valk_app", (tx) => tx`create table valk.stiekem (id int)`)).rejects.toThrow(/permission denied/);
  });

  it("weigert onmogelijke instellingen", async () => {
    await expect(sql`update valk.settings set end_at = start_at - interval '1 day' where id = 1`).rejects.toThrow(
      /check constraint/,
    );
    await expect(sql`update valk.settings set latitude = 120 where id = 1`).rejects.toThrow(/check constraint/);
  });

  it("is idempotent: de migraties nog eens draaien verandert niets", { timeout: 60_000 }, () => {
    const output = execFileSync("npx", ["tsx", "scripts/migrate.ts"], {
      env: { ...process.env, MIGRATION_DATABASE_URL: adminUrl },
      encoding: "utf8",
    });
    expect(output).toMatch(/al toegepast/);
  });
});
