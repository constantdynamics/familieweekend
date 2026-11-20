/**
 * The checklist (admin and spelleiders, with notes), cleaning up after the
 * weekend, and the switch that releases the new app to the family.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { loggedIn, loginAdmin, losseWoorden, resetState } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

async function check(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `toegankelijkheid op ${name}`).toEqual([]);
  expect(await losseWoorden(page), `losse woorden op ${name}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontaal scrollen op ${name}`).toBeLessThanOrEqual(0);
  const viewport = info.project.name.replace(/^(iphone|android)-/, "");
  await page.screenshot({ path: `docs/screenshots/fase-2-4/${viewport}/${name}.png`, fullPage: true });
}

async function nieuwToestel(browser: Browser) {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E.port}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: use.viewport,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  return { context, page: await context.newPage() };
}

test("de afvinklijst vinkt zelf af wat de app ziet, en de rest vink je zelf", async ({ page }, info) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/afvinklijst");
  const code = page.getByRole("listitem").filter({ hasText: "Familiecode instellen" });
  await expect(code.getByRole("img", { name: "Af, de app ziet het zelf" })).toBeVisible();
  const deelnemers = page.getByRole("listitem").filter({ hasText: "Deelnemerslijst invoeren" });
  await expect(deelnemers.getByText(/De app houdt dit zelf bij: 0\snamen/)).toBeVisible();

  const logo = page.getByRole("listitem").filter({ hasText: "Logo laten maken en sturen" });
  await logo.getByRole("checkbox", { name: "Logo laten maken en sturen" }).click();
  await expect(logo.getByText(/Afgevinkt door Beheerder/)).toBeVisible();
  await expect(logo.getByRole("checkbox", { name: "Logo laten maken en sturen" })).toHaveAttribute("aria-checked", "true");

  await logo.getByRole("button", { name: "Notitie plaatsen" }).click();
  await logo.getByLabel("Notitie van Beheerder").fill("Oom Kees maakt het logo met Claude.");
  await logo.getByRole("button", { name: "Plaats notitie" }).click();
  await expect(logo.getByText("Oom Kees maakt het logo met Claude.")).toBeVisible();
  await check(page, info, "40-afvinklijst-beheer");
});

test("spelleiders zien de afvinklijst en plaatsen notities op naam; de familie niet", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/deelnemers#spelleiders");
  await page.getByLabel("Naam").last().fill("Kees");
  await page.getByRole("button", { name: "Voeg spelleider toe" }).click();
  const pin = ((await page.getByText(/^\d{3}\s\d{3}$/).first().textContent()) ?? "").replace(/\D/g, "");

  const spelleider = await nieuwToestel(browser);
  await loggedIn(spelleider.page);
  await spelleider.page.goto("/spelleider");
  await spelleider.page.getByLabel("Jouw PIN").fill(pin);
  await spelleider.page.getByRole("button", { name: "Log in" }).click();
  await spelleider.page.getByRole("link", { name: /Afvinklijst/ }).click();
  const punt = spelleider.page.getByRole("listitem").filter({ hasText: "Spullen voor de zeskamp verzamelen" });
  await punt.getByRole("button", { name: "Notitie plaatsen" }).click();
  await punt.getByLabel("Notitie van Kees").fill("Ik neem de zakken en de planken mee.");
  await punt.getByRole("button", { name: "Plaats notitie" }).click();
  await expect(punt.getByText("Ik neem de zakken en de planken mee.")).toBeVisible();
  await expect(spelleider.page.getByRole("heading", { name: "Punt toevoegen" })).toHaveCount(0);

  // The admin sees the note with Kees's name.
  await page.goto("/beheer/afvinklijst");
  await expect(page.getByText("Ik neem de zakken en de planken mee.")).toBeVisible();
  await expect(page.getByText(/^Kees/).first()).toBeVisible();

  // A family member without a PIN lands on the login screen.
  const familie = await nieuwToestel(browser);
  await loggedIn(familie.page);
  await familie.page.goto("/spelleider/afvinklijst");
  await expect(familie.page).toHaveURL(/\/spelleider$/);
  await expect(familie.page.getByLabel("Jouw PIN")).toBeVisible();

  await spelleider.context.close();
  await familie.context.close();
});

test("alles opruimen vraagt twee keer om bevestiging", async ({ page }, info) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/opruimen");
  await check(page, info, "41-alles-opruimen");
  await page.getByRole("button", { name: "Ik wil alles opruimen" }).click();
  await page.getByLabel("Typ OPRUIMEN om te bevestigen").fill("opruim");
  await page.getByRole("button", { name: "Ruim alles op" }).click();
  await expect(page.getByText("Typ OPRUIMEN in hoofdletters om te bevestigen.")).toBeVisible();
  await page.getByLabel("Typ OPRUIMEN om te bevestigen").fill("OPRUIMEN");
  await page.getByRole("button", { name: "Ruim alles op" }).click();
  await expect(page.getByText(/^Opgeruimd: 0 antwoorden/)).toBeVisible();
});

test("met de schakelaar ziet de familie het nieuwe menu wel of niet", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/instellingen");
  const schakelaar = page.getByRole("switch", { name: "Nieuwe app voor de familie" });
  await expect(schakelaar).toHaveAttribute("aria-checked", "true");
  await schakelaar.click();
  await expect(schakelaar).toHaveAttribute("aria-checked", "false");

  const familie = await nieuwToestel(browser);
  await loggedIn(familie.page);
  const menu = familie.page.getByRole("navigation", { name: "Hoofdmenu" });
  await expect(menu.getByRole("link")).toHaveCount(5);
  await expect(menu.getByRole("link", { name: "Prikbord" })).toHaveCount(0);

  await schakelaar.click();
  await expect(schakelaar).toHaveAttribute("aria-checked", "true");
  await familie.page.reload();
  await expect(menu.getByRole("link", { name: "Prikbord" })).toBeVisible();
  await familie.context.close();
});
