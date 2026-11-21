import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/** Roles are shared by all databases on a cluster: reuse the local password. */
function localAppPassword(): string | undefined {
  try {
    return /^VALK_APP_PASSWORD=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/**
 * End-to-end tests against a production build on a local test database.
 * Run `npm run build` first; `npm run test:e2e` prepares the database and
 * starts the server itself.
 */
export const E2E = {
  // Separate worktrees can run side by side: E2E_PORT and E2E_DB.
  port: Number(process.env.E2E_PORT) || 3100,
  appSecret: "e2e-geheim-alleen-voor-tests-0123456789-abcdefghij",
  cronSecret: "e2e-cron-geheim-0123456789",
  appPassword: process.env.VALK_APP_PASSWORD ?? localAppPassword() ?? "e2e-valk-app-wachtwoord",
  adminUrl:
    process.env.TEST_ADMIN_DATABASE_URL ??
    `postgres://postgres:postgres@localhost:5432/${process.env.E2E_DB ?? "valk_test"}`,
  familyCode: "SPELEN2027",
  adminPin: "582036",
};

const baseURL = `http://localhost:${E2E.port}`;
const appUrl = E2E.adminUrl.replace("postgres:postgres@", `valk_app:${E2E.appPassword}@`);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "off",
  },
  projects: [
    {
      name: "iphone-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: "android-360",
      use: {
        ...devices["Galaxy S9+"],
        browserName: "chromium",
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${E2E.port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: appUrl,
      DATABASE_SSL: "disable",
      APP_SECRET: E2E.appSecret,
      CRON_SECRET: E2E.cronSecret,
      // No Realtime in the tests: a second phone asks every 2.5 s, also when nothing runs live.
      VALK_POLL_CALM_MS: "2500",
    },
  },
});
