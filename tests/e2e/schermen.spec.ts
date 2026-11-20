/**
 * Every screen of this phase: an accessibility check (axe, WCAG 2.2 AA) and a
 * screenshot per viewport in docs/screenshots/fase-1/<viewport>/ for review.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { enterFamilyCode, loggedIn, loginAdmin, resetState, VASTE_TIJD } from "./helpers";

test.use({ reducedMotion: "reduce" });

test.beforeAll(async () => {
  await resetState();
});

async function check(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, `toegankelijkheid op ${name}`).toEqual([]);

  // No horizontal scrolling at this width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontaal scrollen op ${name}`).toBeLessThanOrEqual(0);

  // What a person sees: the top of the screen and, when it scrolls, the bottom.
  const viewport = info.project.name.replace(/^(iphone|android)-/, "");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/screenshots/fase-1/${viewport}/${name}.png` });
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 8);
  if (scrolls) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.screenshot({ path: `docs/screenshots/fase-1/${viewport}/${name}-onder.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

test("welkom", async ({ page }, info) => {
  await page.goto("/welkom");
  await check(page, info, "01-welkom");
  await enterFamilyCode(page, "FOUTJE");
  await expect(page.getByText("Die code klopt niet")).toBeVisible();
  await check(page, info, "02-welkom-foute-code");
});

test("thuis", async ({ page }, info) => {
  // Fixed time, timers keep running (axe needs them).
  await page.clock.setFixedTime(VASTE_TIJD);
  await loggedIn(page);
  await expect(page.getByRole("timer")).toContainText("Nog 166 dagen");
  await check(page, info, "03-thuis");
  await page.getByRole("button", { name: "Zo werkt het" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check(page, info, "04-thuis-installatie-uitleg");
});

test("tabbladen", async ({ page }, info) => {
  await loggedIn(page);
  for (const [path, name] of [
    ["/programma", "05-programma"],
    ["/quiz", "06-quiz"],
    ["/zeskamp", "07-zeskamp"],
    ["/score", "08-score"],
    ["/privacy", "09-privacy"],
    ["/offline", "10-offline"],
    ["/bestaat-niet", "11-niet-gevonden"],
  ]) {
    await page.goto(path);
    await check(page, info, name);
  }
});

test("beheer", async ({ page }, info) => {
  await loggedIn(page);
  await page.goto("/beheer");
  await expect(page.getByRole("heading", { name: "Log in met je PIN" })).toBeVisible();
  await check(page, info, "12-beheer-inloggen");
  await loginAdmin(page);
  await expect(page.getByText("Ingelogd als Beheerder")).toBeVisible();
  await check(page, info, "13-beheer-dashboard");
  for (const [path, name] of [
    ["/beheer/instellingen", "14-beheer-instellingen"],
    ["/beheer/familiecode", "15-beheer-familiecode"],
    ["/beheer/pin", "16-beheer-pin"],
    ["/beheer/logboek", "17-beheer-logboek"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Beheer" })).toBeVisible();
    await check(page, info, name);
  }
});
