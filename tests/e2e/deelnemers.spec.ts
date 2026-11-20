/**
 * Participants, the name step, team PINs and captain takeover, spelleiders,
 * and the test environment.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { enterFamilyCode, loggedIn, loginAdmin, resetState } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

async function plakNamen(page: Page, namen: string[], team = "") {
  await page.goto("/beheer/deelnemers");
  await page.getByLabel("Eén naam per regel").fill(namen.join("\n"));
  if (team) await page.getByLabel("In team").selectOption({ label: team });
  await page.getByRole("button", { name: "Voeg namen toe" }).click();
}

/** Another phone: its own cookies, same viewport as the project. */
async function nieuwToestel(browser: Browser) {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E.port}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: use.viewport,
    deviceScaleFactor: 1,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  return { context, page: await context.newPage() };
}

test("de beheerder plakt namen, dubbele namen komen er niet in", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await plakNamen(page, ["1. Sanne Valkenburg", "- Tim Valkenburg", "Sanne Valkenburg", "", "Oma Riet"], "Team Oranje");
  await expect(page.getByText("3 namen toegevoegd.")).toBeVisible();
  await plakNamen(page, ["Tim Valkenburg", "Opa Kees"]);
  await expect(page.getByText("1 naam toegevoegd. Al in de lijst: Tim Valkenburg.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Oma Riet/ })).toBeVisible();
});

test("een naam hoort bij één toestel; de beheerder kan hem vrijgeven", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await plakNamen(page, ["Sanne Valkenburg", "Tim Valkenburg"]);

  // A new phone enters the code and lands on "Wie ben jij?".
  const eerste = await nieuwToestel(browser);
  await enterFamilyCode(eerste.page);
  await expect(eerste.page).toHaveURL(/\/wie-ben-jij/);
  await eerste.page.getByRole("button", { name: "Sanne Valkenburg" }).click();
  await expect(eerste.page.getByText("Gelukt! Deze telefoon hoort nu bij Sanne Valkenburg.")).toBeVisible();
  // A parent fills in for a child too.
  await eerste.page.getByRole("button", { name: "Tim Valkenburg" }).click();
  await expect(eerste.page.getByRole("heading", { name: "Op deze telefoon zijn" })).toBeVisible();

  // Another phone cannot take the same name.
  const tweede = await nieuwToestel(browser);
  await enterFamilyCode(tweede.page);
  await expect(tweede.page.getByRole("button", { name: /Sanne Valkenburg/ })).toBeDisabled();

  // The admin frees it; then the other phone can choose it.
  await page.goto("/beheer/deelnemers");
  await page.getByRole("link", { name: /Sanne Valkenburg/ }).click();
  await page.getByRole("button", { name: "Geef naam vrij" }).click();
  await expect(page.getByRole("button", { name: "Geef naam vrij" })).toHaveCount(0);
  await tweede.page.reload();
  await tweede.page.getByRole("button", { name: "Sanne Valkenburg" }).click();
  await expect(tweede.page.getByText("Gelukt! Deze telefoon hoort nu bij Sanne Valkenburg.")).toBeVisible();

  await eerste.context.close();
  await tweede.context.close();
});

test("een tweede captaintoestel neemt het over", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/deelnemers");
  await page.getByRole("button", { name: "Maak de team-PIN" }).first().click();
  const pinTekst = await page.getByText(/^\d{3}\s\d{3}$/).first().textContent();
  const pin = (pinTekst ?? "").replace(/\D/g, "");
  expect(pin).toHaveLength(6);

  const eerste = await nieuwToestel(browser);
  await loggedIn(eerste.page);
  await eerste.page.goto("/captain");
  await eerste.page.getByLabel("Team-PIN", { exact: true }).fill(pin);
  await eerste.page.getByRole("button", { name: "Word teamtoestel" }).click();
  await expect(eerste.page.getByText("Deze telefoon is het teamtoestel.")).toBeVisible();

  const tweede = await nieuwToestel(browser);
  await loggedIn(tweede.page);
  await tweede.page.goto("/captain");
  await tweede.page.getByLabel("Team-PIN", { exact: true }).fill(pin);
  await tweede.page.getByRole("button", { name: "Word teamtoestel" }).click();
  await expect(tweede.page.getByText("Deze telefoon is het teamtoestel.")).toBeVisible();

  await eerste.page.goto("/captain");
  await expect(eerste.page.getByText("Je teamtoestel is overgenomen door een ander toestel.")).toBeVisible();

  await eerste.context.close();
  await tweede.context.close();
});

test("een spelleider krijgt een PIN en logt daarmee in", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/deelnemers#spelleiders");
  await page.getByLabel("Naam").last().fill("Kees");
  await page.getByRole("button", { name: "Voeg spelleider toe" }).click();
  const pinTekst = await page.getByText(/^\d{3}\s\d{3}$/).first().textContent();
  const pin = (pinTekst ?? "").replace(/\D/g, "");

  const spelleider = await nieuwToestel(browser);
  await loggedIn(spelleider.page);
  await spelleider.page.goto("/spelleider");
  await spelleider.page.getByLabel("Jouw PIN").fill(pin);
  await spelleider.page.getByRole("button", { name: "Log in" }).click();
  await expect(spelleider.page.getByText("Hoi Kees! Wat ga je doen?")).toBeVisible();
  await spelleider.context.close();
});

test("de proef staat los van het echte weekend", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/proef");
  await page.getByRole("button", { name: "Zet de proef klaar" }).click();
  await expect(page.getByText("PIN voor Proefteam Oranje")).toBeVisible();
  await page.getByRole("button", { name: "Ga de proef in op deze telefoon" }).click();
  await expect(page.getByText("Je zit in de proef", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Proef." })).toBeVisible();

  // In the test environment the admin sees the test teams, not the real ones.
  await page.goto("/beheer/deelnemers");
  await expect(page.getByRole("heading", { name: "Proefteam Oranje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Oranje", exact: true })).toHaveCount(0);

  await page.goto("/beheer/proef");
  await page.getByRole("button", { name: "Verlaat de proef" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/beheer/deelnemers");
  await expect(page.getByRole("heading", { name: "Team Oranje", exact: true })).toBeVisible();
});
