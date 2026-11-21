/**
 * Helpers for the quiz tests: phones in their own browser contexts, the
 * test environment with four test teams, the check of every screen (axe,
 * no lonely words, no sideways scrolling) with screenshots, and a local
 * stand-in for the OpenStreetMap tiles (the build container has no internet).
 */
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { enterFamilyCode, loginAdmin, losseWoorden } from "./helpers";

/* ------------------------------------------------------------------------ */
/* A map tile: 256 × 256, light sand with a faint grid, as a PNG.           */
/* ------------------------------------------------------------------------ */

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function tilePng(): Buffer {
  const size = 256;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const line = x % 64 === 0 || y % 64 === 0;
      const [r, g, b] = line ? [205, 214, 196] : [226, 232, 214];
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const TEGEL = tilePng();

/** OpenStreetMap tiles come from here in the tests. */
export async function nepTegels(context: BrowserContext) {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TEGEL, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
}

/* ------------------------------------------------------------------------ */
/* Phones.                                                                  */
/* ------------------------------------------------------------------------ */

export type Toestel = { context: BrowserContext; page: Page };

/** Another phone: its own cookies, the viewport of the project, no service worker. */
export async function toestel(browser: Browser): Promise<Toestel> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E.port}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: use.viewport,
    deviceScaleFactor: 2,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await nepTegels(context);
  return { context, page: await context.newPage() };
}

export type Proef = { pins: Record<string, string>; uitnodiging: string };

/** The admin sets up the test environment (with the demo quiz) and goes in. */
export async function zetProefKlaar(admin: Page): Promise<Proef> {
  await admin.goto("/beheer/proef");
  await admin.getByRole("button", { name: /Zet de proef klaar|Begin opnieuw/ }).click();
  await expect(admin.getByText("PIN voor Proefteam Oranje")).toBeVisible({ timeout: 20_000 });
  const pins: Record<string, string> = {};
  for (const kleur of ["Oranje", "Mosterd", "Avocado", "Petrol"]) {
    const kaart = admin.getByRole("status").filter({ hasText: `PIN voor Proefteam ${kleur}` });
    const tekst = await kaart.locator("p").nth(1).textContent();
    pins[kleur] = (tekst ?? "").replace(/\D/g, "");
    expect(pins[kleur]).toHaveLength(6);
  }
  await admin.getByRole("button", { name: "Ga de proef in op deze telefoon" }).click();
  await expect(admin.getByText("Je zit in de proef", { exact: true })).toBeVisible();
  await admin.getByRole("button", { name: "Maak een uitnodigingslink" }).click();
  const link = await admin.getByText(/\/proef\/[\w.-]+$/).textContent();
  return { pins, uitnodiging: new URL(link ?? "").pathname };
}

/** A phone enters the code, joins the test environment and picks a name. */
export async function doeMee(phone: Page, proef: Proef, naam: string | null) {
  await enterFamilyCode(phone);
  await expect(phone).not.toHaveURL(/\/welkom/);
  await phone.goto(proef.uitnodiging);
  await expect(phone.getByRole("status").filter({ hasText: "Proef." })).toBeVisible();
  if (naam) {
    await phone.goto("/wie-ben-jij");
    await phone.getByRole("button", { name: naam, exact: true }).click();
    await expect(phone.getByText(`Gelukt! Deze telefoon hoort nu bij ${naam}.`)).toBeVisible();
  }
}

/** A phone becomes the team device with the team PIN, and lands on the quiz. */
export async function wordCaptain(phone: Page, pin: string) {
  await phone.goto("/captain?terug=/quiz");
  await phone.getByLabel("Team-PIN", { exact: true }).fill(pin);
  await phone.getByRole("button", { name: "Word teamtoestel" }).click();
  await expect(phone).toHaveURL(/\/quiz$/);
}

export async function adminInDeProef(admin: Page) {
  await enterFamilyCode(admin);
  await expect(admin).not.toHaveURL(/\/welkom/);
  await loginAdmin(admin);
}

/** A button of the quizmaster console. */
export async function console_(admin: Page, knop: string | RegExp) {
  const button = admin.getByRole("button", { name: knop }).first();
  await expect(button).toBeEnabled();
  await button.click();
}

/* ------------------------------------------------------------------------ */
/* The check of every screen, with screenshots for review.                   */
/* ------------------------------------------------------------------------ */

export async function check(page: Page, name: string, opties: { scroll?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready);
  // After a client-side navigation the title follows a moment later.
  await expect.poll(() => page.title()).not.toBe("");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, `toegankelijkheid op ${name}`).toEqual([]);
  expect(await losseWoorden(page), `losse woorden op ${name}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontaal scrollen op ${name}`).toBeLessThanOrEqual(0);

  const viewport = test.info().project.name.replace(/^(iphone|android)-/, "");
  const dir = `docs/screenshots/fase-2-4/${viewport}`;
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/${name}.png` });
  if (opties.scroll !== false) {
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 8);
    if (scrolls) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: `${dir}/${name}-onder.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
}

/** The quiz state as this phone gets it. */
export async function stand(page: Page): Promise<Record<string, unknown> & { phase: string | null; status: string }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/quiz/state", { cache: "no-store" });
    return response.json();
  });
}

/** Wait until this phone's screen shows the phase (the doorbell polls every few seconds without Realtime). */
export async function wachtOpFase(page: Page, fase: string, status = "quiz") {
  await expect.poll(async () => {
    const s = await stand(page);
    return `${s.status}:${s.phase}`;
  }, { timeout: 15_000 }).toBe(`${status}:${fase}`);
}
