/**
 * Practising the quiz: the beheerder and spelleiders play a question, a
 * round or the whole quiz alone, exactly as a captain sees it. Nothing is
 * stored, and the family cannot get in.
 */
import { expect, test, type Page } from "@playwright/test";
import { db, loggedIn, resetState } from "./helpers";
import { adminInDeProef, check, nepTegels, toestel, zetProefKlaar } from "./quizHulp";

test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

test.beforeEach(async () => {
  await resetState();
});

async function aantalAntwoorden(): Promise<number> {
  const sql = db();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from valk.quiz_answers`;
  await sql.end();
  return row.n;
}

/** The practice step of the quizmaster: reveal, next question, score. */
async function oefenKnop(page: Page, naam: string | RegExp) {
  await page.getByRole("region", { name: "Oefenen" }).getByRole("button", { name: naam }).click();
}

test("de beheerder speelt een ronde als captain, met de ringen bij een kaartvraag", async ({ page }) => {
  test.setTimeout(120_000);
  await nepTegels(page.context());
  await adminInDeProef(page);
  await zetProefKlaar(page);
  await page.goto("/beheer/quiz?quiz=demo");
  await page.getByRole("link", { name: /Waar ligt\sValkenburg\?/ }).click();
  await page.getByRole("link", { name: "Speel deze ronde" }).filter({ visible: true }).click();

  // The round screen, as the captain of the practice team; no menu, no joker.
  await expect(page.getByText(/^Oefenen\.\sJe\sspeelt\sals\scaptain\.\sEr\swordt\sniets\sbewaard\.$/)).toBeVisible();
  await expect(page.getByText(/Captain\svan\sOefenteam/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Waar ligt\sValkenburg\?/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hoofdmenu" })).toBeHidden();
  await expect(page.getByText(/Speel je joker/)).toHaveCount(0);
  await check(page, "90-oefenen-rondescherm");

  // Question 1: the map, with three photos of the Valkenburgerstraat.
  await oefenKnop(page, "Naar de eerste vraag");
  await expect(page.getByText(/^Ronde\s2\svan\s5,\svraag\s1\svan\s3$/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Foto bij vraag 1, \d van 3$/ })).toHaveCount(3);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 15_000 });
  // The pin in the middle of the map of the Netherlands: some 36 km from the right place, so 1 point.
  await page.getByRole("button", { name: "Zet speld hier" }).click();
  await expect(page.getByText(/^Gekozen\.\sWijzigen\skan\stot\sde\squizmaster\sde\svraag\ssluit\.$/)).toBeVisible();
  await check(page, "91-oefenen-kaart-gekozen");
  await oefenKnop(page, "Onthul het antwoord");
  await expect(page.getByText(/^Goed!\s\d+\skm\sernaast:\s\+1\spunt\.$/)).toBeVisible();
  // The rings for 3, 2 and 1 point, with their legend, and the dashed line to the pin.
  const legenda = page.getByRole("list", { name: "Ringen op de kaart" });
  await expect(legenda.getByRole("listitem")).toHaveText([/3\spunten\stot\s5\skm/, /2\spunten\stot\s20\skm/, /1\spunt\stot\s75\skm/]);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(4);
  await check(page, "92-oefenen-kaart-onthuld");

  // Questions 2 and 3 without a pin.
  for (const vraag of [2, 3]) {
    await oefenKnop(page, "Volgende vraag");
    await expect(page.getByText(new RegExp(`^Ronde\\s2\\svan\\s5,\\svraag\\s${vraag}\\svan\\s3$`))).toBeVisible();
    await oefenKnop(page, "Onthul het antwoord");
    await expect(page.getByText(/Jullie\shadden\sgeen\santwoord\sgegeven/)).toBeVisible();
  }
  await oefenKnop(page, "Bekijk je score");
  await expect(page.getByRole("heading", { level: 1, name: "Klaar met oefenen" })).toBeVisible();
  await expect(page.getByText(/^Je\shaalde\s1\spunt\svan\sde\s9\sbij\s3\svragen\.$/)).toBeVisible();
  await check(page, "93-oefenen-score");

  // Back to the round, and nothing was stored.
  await page.getByRole("link", { name: "Terug naar ronde 2" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ronde 2" })).toBeVisible();
  expect(await aantalAntwoorden()).toBe(0);
});

test("de beheerder speelt één vraag vanuit de vraageditor", async ({ page }) => {
  await adminInDeProef(page);
  await zetProefKlaar(page);
  await page.goto("/beheer/quiz?quiz=demo");
  await page.getByRole("link", { name: /Hemelvaart en\sMoederdag/ }).click();
  await page.getByRole("link", { name: "Bewerk" }).first().click();
  await page.getByRole("link", { name: "Speel deze vraag" }).filter({ visible: true }).click();

  // Straight to the question, without the round screen.
  await expect(page.getByText(/^Ronde\s1\svan\s5,\svraag\s1\svan\s3$/)).toBeVisible();
  await expect(page.getByText(/^Overleg\smet\sje\steam\sen\stik\sop\seen\santwoord\.$/)).toBeVisible();
  await check(page, "94-oefenen-vraag-open");
  await page.getByRole("button", { name: /Donderdag/ }).click();
  await expect(page.getByText(/^Gekozen\./)).toBeVisible();
  await oefenKnop(page, "Onthul het antwoord");
  await expect(page.getByText(/^Goed!\s\+1\spunt\.$/)).toBeVisible();
  await page.getByRole("region", { name: "Oefenen" }).getByRole("link", { name: "Klaar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vraag bewerken" })).toBeVisible();
  expect(await aantalAntwoorden()).toBe(0);
});

test("een spelleider oefent vanaf het spelleidersscherm; de familie komt er niet in", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await adminInDeProef(page);
  await zetProefKlaar(page);
  await page.goto("/beheer/deelnemers#spelleiders");
  await page.getByLabel("Naam").last().fill("Kees");
  await page.getByRole("button", { name: "Voeg spelleider toe" }).click();
  const pin = ((await page.getByText(/^\d{3}\s\d{3}$/).first().textContent()) ?? "").replace(/\D/g, "");

  const spelleider = await toestel(browser);
  await loggedIn(spelleider.page);
  await spelleider.page.goto("/spelleider");
  await spelleider.page.locator("form[data-klaar]").waitFor();
  await spelleider.page.getByLabel("Jouw PIN").fill(pin);
  await spelleider.page.getByRole("button", { name: "Log in" }).click();
  await spelleider.page.getByRole("link", { name: /Quiz oefenen/ }).click();
  await expect(spelleider.page.getByRole("heading", { level: 1, name: "Quiz oefenen" })).toBeVisible();
  await expect(spelleider.page.getByRole("link", { name: "Speel ronde 2" })).toBeVisible();
  await check(spelleider.page, "95-oefenen-overzicht-spelleider");
  await spelleider.page.getByRole("link", { name: "Speel de hele quiz" }).first().click();
  await expect(spelleider.page.getByRole("heading", { level: 1, name: /Hemelvaart en\sMoederdag/ })).toBeVisible();
  await spelleider.page.getByRole("link", { name: "Stop" }).click();
  await expect(spelleider.page.getByRole("heading", { level: 1, name: "Quiz oefenen" })).toBeVisible();
  await spelleider.context.close();

  // A family member sees no questions, not on the page and not through the API.
  const familie = await toestel(browser);
  await loggedIn(familie.page);
  await familie.page.goto("/quiz/oefenen?quiz=00000000-0000-4000-8000-000000000000");
  await expect(familie.page.getByText(/Oefenen\sis\svoor\sde\sbeheerder\sen\sde\sspelleiders/)).toBeVisible();
  const api = await familie.page.evaluate(async () => {
    const response = await fetch("/api/quiz/oefenen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz: "00000000-0000-4000-8000-000000000000", ronde: 1, vraag: null, fase: "open" }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(api).toEqual({ status: 403, body: { fout: "Oefenen is alleen voor de beheerder en de spelleiders." } });
  await familie.context.close();
});

test.describe("met de service worker aan", () => {
  // The other tests block the service worker; this one needs it, like a real phone.
  test.use({ serviceWorkers: "allow" });

  test("de kaart laadt zijn tegels, ook als de service worker de pagina beheert", async ({ page }) => {
    test.setTimeout(90_000);
    await nepTegels(page.context());
    await adminInDeProef(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await zetProefKlaar(page);
    await page.goto("/beheer/quiz?quiz=demo");
    await page.getByRole("link", { name: /Waar ligt\sValkenburg\?/ }).click();
    await page.getByRole("link", { name: "Speel deze ronde" }).filter({ visible: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await oefenKnop(page, "Naar de eerste vraag");
    // Tiles of another site must not go through the worker: its connect-src would block them.
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 15_000 });
  });
});
