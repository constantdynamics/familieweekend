import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { db, enterFamilyCode, loggedIn, loginAdmin, resetState, tryAdminPin } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

test("de beheerder logt in met de PIN en ziet het dashboard", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await expect(page.getByRole("heading", { level: 1, name: "Beheer" })).toBeVisible();
  await expect(page.getByText("Ingelogd als Beheerder")).toBeVisible();
  for (const tegel of ["Instellingen", "Familiecode", "Mijn PIN", "Logboek"]) {
    await expect(page.getByRole("link", { name: new RegExp(tegel) })).toBeVisible();
  }
});

test("een verkeerde PIN telt af, en na vijf keer zit je tien minuten vast", async ({ page }) => {
  await loggedIn(page);
  for (let left = 4; left >= 1; left -= 1) {
    await tryAdminPin(page, "111111");
    await expect(page.getByText(`Die PIN klopt niet. Je kunt het nog ${left} keer proberen.`)).toBeVisible();
  }
  await tryAdminPin(page, "111111");
  await expect(page.getByText("Wacht nu tien minuten")).toBeVisible();
  // Even the right PIN is refused now.
  await tryAdminPin(page, E2E.adminPin);
  await expect(page.getByText(/Te veel pogingen\. Probeer het om \d{2}:\d{2} opnieuw\./)).toBeVisible();
});

test("instellingen wijzigen: Thuis toont meteen de nieuwe aftrap en het logboek de oude waarde", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.getByRole("link", { name: /Instellingen/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Instellingen" })).toBeVisible();

  await page.getByLabel("Aftrap: tijd").fill("15:30");
  await page.getByLabel("Naam van de locatie").fill("Het Valkennest");
  await page.getByRole("button", { name: "Bewaar instellingen" }).click();
  await expect(page.getByText("Instellingen bewaard.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Nog te gaan tot de aftrap op donderdag 6 mei, 15:30")).toBeVisible();
  await expect(page.getByText("Het Valkennest, Borkel en Schaft")).toBeVisible();

  await page.goto("/beheer/logboek");
  const regel = page.getByRole("listitem").filter({ hasText: "Instellingen gewijzigd" }).first();
  await expect(regel).toContainText("locatie: De Dommelvallei → Het Valkennest");
  await expect(regel).toContainText("aftrap: donderdag 6 mei 2027 om 14:00 → donderdag 6 mei 2027 om 15:30");
});

test("instellingen met fouten worden niet bewaard en zeggen wat er mis is", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/instellingen");
  await page.getByLabel("Einde van het weekend: datum").fill("2027-05-01");
  await page.getByLabel("Breedtegraad").fill("123");
  await page.getByRole("button", { name: "Bewaar instellingen" }).click();
  await expect(page.getByText("Niet alles is goed ingevuld.")).toBeVisible();
  await expect(page.getByText("Het einde moet na de aftrap liggen.")).toBeVisible();
  await expect(page.getByText("Een breedtegraad ligt tussen -90 en 90.")).toBeVisible();
  // What was typed stays in the form.
  await expect(page.getByLabel("Breedtegraad")).toHaveValue("123");
});

test("de familiecode wijzigen: de oude werkt niet meer, de nieuwe wel", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/familiecode");
  await page.getByLabel("Nieuwe familiecode").fill("Lauwer-4827");
  await page.getByLabel("Herhaal de nieuwe code").fill("LAUWER 4827");
  await page.getByRole("button", { name: "Wijzig de familiecode" }).click();
  await expect(page.getByText("Familiecode gewijzigd.")).toBeVisible();

  // This phone stays in.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);

  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await enterFamilyCode(other, E2E.familyCode);
  await expect(other.getByText("Die code klopt niet")).toBeVisible();
  await enterFamilyCode(other, "lauwer4827");
  await expect(other).toHaveURL(/\/$/);
  await fresh.close();

  const sql = db();
  const [row] = await sql`select count(*)::int as n from valk.audit_log where action = 'familiecode.gewijzigd'`;
  const [hash] = await sql`select code_hash from valk.family_access`;
  await sql.end();
  expect(row.n).toBe(1);
  expect(hash.code_hash).not.toContain("LAUWER");
});

test("een te korte of verschillende familiecode wordt geweigerd", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/familiecode");
  await page.getByLabel("Nieuwe familiecode").fill("kort");
  await page.getByLabel("Herhaal de nieuwe code").fill("kort");
  await page.getByRole("button", { name: "Wijzig de familiecode" }).click();
  await expect(page.getByText("Maak de code minstens 6 tekens lang.").first()).toBeVisible();

  await page.getByLabel("Nieuwe familiecode").fill("LAUWER4827");
  await page.getByLabel("Herhaal de nieuwe code").fill("LAUWER4828");
  await page.getByRole("button", { name: "Wijzig de familiecode" }).click();
  await expect(page.getByText("De twee codes zijn niet hetzelfde.")).toBeVisible();
});

test("de PIN wijzigen logt andere telefoons uit, deze blijft ingelogd", async ({ page, browser }) => {
  await loggedIn(page);
  await loginAdmin(page);

  const second = await browser.newContext();
  const phone2 = await second.newPage();
  await loggedIn(phone2);
  await loginAdmin(phone2);
  await expect(phone2.getByText("Ingelogd als Beheerder")).toBeVisible();

  await page.goto("/beheer/pin");
  await page.getByLabel("Je huidige PIN").fill(E2E.adminPin);
  await page.getByLabel("Nieuwe PIN", { exact: true }).fill("123456");
  await page.getByLabel("Herhaal de nieuwe PIN").fill("123456");
  await page.getByRole("button", { name: "Wijzig mijn PIN" }).click();
  await expect(page.getByText("Kies een PIN die geen oplopende of aflopende reeks is.").first()).toBeVisible();

  await page.getByLabel("Je huidige PIN").fill(E2E.adminPin);
  await page.getByLabel("Nieuwe PIN", { exact: true }).fill("730418");
  await page.getByLabel("Herhaal de nieuwe PIN").fill("730418");
  await page.getByRole("button", { name: "Wijzig mijn PIN" }).click();
  await expect(page.getByText("PIN gewijzigd.")).toBeVisible();

  await page.goto("/beheer");
  await expect(page.getByText("Ingelogd als Beheerder")).toBeVisible();

  await phone2.goto("/beheer");
  await expect(phone2.getByRole("heading", { name: "Log in met je PIN" })).toBeVisible();
  await loginAdmin(phone2, "730418");
  await expect(phone2.getByText("Ingelogd als Beheerder")).toBeVisible();
  await second.close();
});

test("beheerpagina's zijn dicht zonder PIN", async ({ page }) => {
  await loggedIn(page);
  for (const path of ["/beheer/instellingen", "/beheer/familiecode", "/beheer/pin", "/beheer/logboek"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/beheer$/);
    await expect(page.getByRole("heading", { name: "Log in met je PIN" })).toBeVisible();
  }
});

test("uitloggen werkt en staat in het logboek", async ({ page }) => {
  await loggedIn(page);
  await loginAdmin(page);
  await page.getByRole("button", { name: "Log uit" }).click();
  await expect(page.getByRole("heading", { name: "Log in met je PIN" })).toBeVisible();
  const sql = db();
  const rows = await sql`select action from valk.audit_log order by id`;
  await sql.end();
  expect(rows.map((r) => r.action)).toEqual(["beheer.ingelogd", "beheer.uitgelogd"]);
});
