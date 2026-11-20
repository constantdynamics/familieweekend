import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E } from "../../playwright.config";

export const db = () => postgres(E2E.adminUrl, { max: 1, onnotice: () => {} });

/** Clear rate-limit history and the logbook, and put the defaults back. */
export async function resetState() {
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-local.ts"], {
    env: {
      ...process.env,
      MIGRATION_DATABASE_URL: E2E.adminUrl,
      APP_SECRET: E2E.appSecret,
      VALK_APP_PASSWORD: E2E.appPassword,
      SEED_FAMILY_CODE: E2E.familyCode,
      SEED_ADMIN_PIN: E2E.adminPin,
      SEED_ADMIN_NAME: "Beheerder",
      SEED_RESET: "1",
    },
    stdio: "pipe",
  });
  // The seed writes straight to the database; let the app drop its cached settings.
  const response = await fetch(`http://localhost:${E2E.port}/api/keepalive`, {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  if (!response.ok) throw new Error(`keepalive gaf ${response.status}`);
}

/** A moment in November 2026, so countdown screenshots are stable. */
export const VASTE_TIJD = new Date("2026-11-20T14:20:15+01:00");

export async function enterFamilyCode(page: Page, code = E2E.familyCode) {
  await page.goto("/welkom");
  await page.getByLabel("Familiecode").fill(code);
  await page.getByRole("button", { name: "Kom binnen" }).click();
}

export async function loggedIn(page: Page) {
  await enterFamilyCode(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /De Valkenburger\s*Spelen/ })).toBeVisible();
}

/** Type a PIN on the admin login screen; does not wait for the outcome. */
export async function tryAdminPin(page: Page, pin: string) {
  await page.goto("/beheer");
  await page.getByLabel("Jouw PIN").fill(pin);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Log in as admin and wait until the dashboard is there. */
export async function loginAdmin(page: Page, pin = E2E.adminPin) {
  await tryAdminPin(page, pin);
  await expect(page.getByText(/^Ingelogd als /)).toBeVisible();
}
