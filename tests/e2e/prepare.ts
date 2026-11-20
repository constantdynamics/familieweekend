/**
 * Prepares the local test database before Playwright starts the server:
 * the database itself (each worktree may use its own, E2E_DB), migrations,
 * a known family code and admin PIN, and empty game data.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { E2E } from "../../playwright.config";

const env = {
  ...process.env,
  MIGRATION_DATABASE_URL: E2E.adminUrl,
  APP_SECRET: E2E.appSecret,
  VALK_APP_PASSWORD: E2E.appPassword,
  SEED_FAMILY_CODE: E2E.familyCode,
  SEED_ADMIN_PIN: E2E.adminPin,
  SEED_ADMIN_NAME: "Beheerder",
  SEED_RESET: "1",
};

async function ensureDatabase() {
  const database = new URL(E2E.adminUrl).pathname.slice(1);
  const maintenance = new URL(E2E.adminUrl);
  maintenance.pathname = "/postgres";
  const admin = postgres(maintenance.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${database}`;
    if (!exists) await admin.unsafe(`create database "${database.replace(/"/g, "")}"`);
  } finally {
    await admin.end();
  }
}

async function main() {
  await ensureDatabase();
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-local.ts"], { env, stdio: "inherit" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
