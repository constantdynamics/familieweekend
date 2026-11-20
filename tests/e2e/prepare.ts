/**
 * Prepares the local test database before Playwright starts the server:
 * migrations, a known family code and admin PIN, empty logs.
 */
import { execFileSync } from "node:child_process";
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
execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env, stdio: "inherit" });
execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-local.ts"], { env, stdio: "inherit" });
