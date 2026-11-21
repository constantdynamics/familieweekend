/**
 * The local test database for the integration tests. The app role's password
 * comes from VALK_APP_PASSWORD (in CI) or from .env.local (on a dev machine).
 */
import { existsSync, readFileSync } from "node:fs";

export const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/valk_test";

function appPassword(): string {
  if (process.env.VALK_APP_PASSWORD) return process.env.VALK_APP_PASSWORD;
  if (!existsSync(".env.local")) return "";
  return /^VALK_APP_PASSWORD=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim() ?? "";
}

/** The same database as the app role, as the app itself connects. */
export const appUrl = adminUrl.replace("postgres:postgres@", `valk_app:${appPassword()}@`);
