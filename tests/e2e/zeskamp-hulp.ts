/**
 * Shared steps for the scoreboard, zeskamp and ceremony specs: a screen
 * check with screenshots for review, extra phones, and logging in as
 * spelleider or captain.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { db, losseWoorden } from "./helpers";

/** Wait until React has taken over this element: typing before that can get lost. */
export async function gehydrateerd(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps"))), { timeout: 10_000 })
    .toBe(true);
}

/** Enter the family code once React is ready, and wait for Thuis. */
export async function binnen(page: Page) {
  await page.goto("/welkom");
  const veld = page.getByLabel("Familiecode");
  await gehydrateerd(veld);
  await veld.fill(E2E.familyCode);
  await page.getByRole("button", { name: "Kom binnen" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /De Valkenburger\s*Spelen/ })).toBeVisible();
}

/** Log in as admin once React is ready. */
export async function loginBeheerder(page: Page) {
  await page.goto("/beheer");
  const veld = page.getByLabel("Jouw PIN");
  await gehydrateerd(veld);
  await veld.fill(E2E.adminPin);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/^Ingelogd als /)).toBeVisible();
}

/** Axe (WCAG 2.2 AA), no lonely words, no sideways scrolling, and screenshots in docs/screenshots/fase-2-4. */
export async function check(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // After a server action the title streams in again; let it land first.
  await expect.poll(() => page.title()).not.toBe("");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, `toegankelijkheid op ${name}`).toEqual([]);
  expect(await losseWoorden(page), `losse woorden op ${name}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontaal scrollen op ${name}`).toBeLessThanOrEqual(0);

  const viewport = info.project.name.replace(/^(iphone|android)-/, "");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/screenshots/fase-2-4/${viewport}/${name}.png` });
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 8);
  if (scrolls) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.screenshot({ path: `docs/screenshots/fase-2-4/${viewport}/${name}-onder.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

/**
 * These specs run without the service worker: on a first visit it can take
 * control halfway through a login and reload the page (AppSignalen reloads
 * on a "controlling" event that Serwist marks as external). The offline
 * queue of the spelleider does not need it: that is IndexedDB.
 */
export const ZONDER_SERVICE_WORKER = { serviceWorkers: "block" } as const;

/** Another phone: its own cookies, the viewport of the project. */
export async function nieuwToestel(browser: Browser, extra: BrowserContextOptions = {}) {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E.port}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: use.viewport,
    deviceScaleFactor: 1,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    ...ZONDER_SERVICE_WORKER,
    ...extra,
  });
  return { context, page: await context.newPage() };
}

function pinUit(text: string | null): string {
  const pin = (text ?? "").replace(/\D/g, "");
  expect(pin).toHaveLength(6);
  return pin;
}

/** The admin adds a spelleider and gets the PIN (shown once). */
export async function maakSpelleider(admin: Page, naam: string): Promise<string> {
  await admin.goto("/beheer/deelnemers#spelleiders");
  await admin.getByLabel("Naam").last().fill(naam);
  await admin.getByRole("button", { name: "Voeg spelleider toe" }).click();
  // Only a hash change: the page may still show an earlier PIN, so read the one for this name.
  const melding = admin.getByRole("status").filter({ hasText: `PIN voor ${naam}` });
  return pinUit(await melding.getByText(/^\d{3}\s\d{3}$/).textContent());
}

export async function loginSpelleider(page: Page, pin: string, naam: string) {
  await binnen(page);
  await page.goto("/spelleider");
  const veld = page.getByLabel("Jouw PIN");
  await gehydrateerd(veld);
  await veld.fill(pin);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(`Hoi ${naam}! Wat ga je doen?`)).toBeVisible();
}

/** A new team PIN for one team (the old captain device is logged out). */
export async function maakTeamPin(admin: Page, team: string): Promise<string> {
  await admin.goto("/beheer/deelnemers#teams");
  // The innermost section with the team's heading is its card.
  const kaart = admin.locator("section").filter({ has: admin.getByRole("heading", { name: team, exact: true }) }).last();
  await kaart.getByRole("button", { name: /team-PIN/ }).click();
  return pinUit(await kaart.getByText(/^\d{3}\s\d{3}$/).textContent());
}

export async function loginCaptain(page: Page, pin: string) {
  await binnen(page);
  await page.goto("/captain");
  const veld = page.getByLabel("Team-PIN", { exact: true });
  await gehydrateerd(veld);
  await veld.fill(pin);
  await page.getByRole("button", { name: "Word teamtoestel" }).click();
  await expect(page.getByText("Deze telefoon is het teamtoestel.")).toBeVisible();
}

/** The id of a game (or other part) by its name, in the real environment. */
export async function onderdeelId(naam: string, env: "live" | "test" = "live"): Promise<string> {
  const sql = db();
  try {
    const [row] = await sql<{ id: string }[]>`select id from valk.events where env = ${env} and name = ${naam}`;
    if (!row) throw new Error(`Onderdeel ${naam} niet gevonden`);
    return row.id;
  } finally {
    await sql.end();
  }
}

/** The admin fills in the vrijdag points (team name → points as typed). */
export async function vrijdagPunten(admin: Page, punten: Record<string, string>) {
  await admin.goto("/beheer/zeskamp#vrijdag");
  for (const [team, waarde] of Object.entries(punten)) await admin.getByLabel(team, { exact: true }).fill(waarde);
  await admin.getByRole("button", { name: "Bewaar punten van vrijdag" }).click();
  await expect(admin.getByText("Punten van vrijdag bewaard.")).toBeVisible();
}
