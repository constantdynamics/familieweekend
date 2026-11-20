import { expect, test } from "@playwright/test";
import { loggedIn, resetState, VASTE_TIJD } from "./helpers";

test.beforeEach(async () => {
  await resetState();
});

test("Thuis toont embleem, data, locatie en de aftelklok tot de aftrap", async ({ page }) => {
  await page.clock.install({ time: VASTE_TIJD });
  await loggedIn(page);

  await expect(page.getByRole("img", { name: /valk in een lauwerkrans/ })).toBeVisible();
  await expect(page.getByText("Hemelvaart", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/De Valkenburger\s*Spelen\s*2027/);
  await expect(page.getByText("do 6 t/m zo 9 mei")).toBeVisible();
  await expect(page.getByText("De Dommelvallei, Borkel en Schaft")).toBeVisible();

  const klok = page.getByRole("region", { name: "Aftelklok" });
  await expect(klok.getByText("Nog te gaan tot de aftrap op donderdag 6 mei, 14:00")).toBeVisible();
  // 20 nov 2026 14:20:15 → 6 mei 2027 14:00 (zomertijd): 166 dagen, 22 uur, 39 min, 45 sec.
  await expect(klok.getByText("166", { exact: true })).toBeVisible();
  await expect(klok.getByText("22", { exact: true })).toBeVisible();
  await expect(klok.getByText("39", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("Nog 166 dagen, 22 uur en 39 minuten tot de aftrap.");

  await page.clock.runFor(2000);
  await expect(klok.getByText("43", { exact: true })).toBeVisible();
});

test("op de dag zelf staat er: het is zover", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-05-06T14:00:05+02:00") });
  await loggedIn(page);
  await expect(page.getByText("Het is zover!")).toBeVisible();
});

test("de fun facts komen eraan, met de deadline", async ({ page }) => {
  await loggedIn(page);
  const kaart = page.getByRole("region", { name: "Je fun facts" });
  await expect(kaart.getByText("Vanaf januari")).toBeVisible();
  await expect(kaart.getByText("Invullen kan tot 1 april.")).toBeVisible();
});

test("de uitleg voor het beginscherm past bij de telefoon en opent een stappenplan", async ({ page }, info) => {
  await loggedIn(page);
  if (info.project.name.startsWith("iphone")) {
    await expect(page.getByText("tik op Deel en kies Zet op beginscherm")).toBeVisible();
  } else {
    await expect(page.getByText("via het menu van je browser")).toBeVisible();
  }
  await page.getByRole("button", { name: "Zo werkt het" }).click();
  const dialog = page.getByRole("dialog", { name: "Zet de app op je beginscherm" });
  await expect(dialog).toBeVisible();
  const tab = info.project.name.startsWith("iphone") ? "iPhone" : "Android";
  await expect(dialog.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "Android" }).click();
  await expect(dialog.getByText("Toevoegen aan startscherm")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("op Android verschijnt de echte installatieknop als de browser hem aanbiedt", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("android"), "Alleen op Android");
  await loggedIn(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
    event.prompt = async () => {
      (window as unknown as Record<string, unknown>).__gevraagd = true;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Installeer de app" }).click();
  await expect(page.getByText("Gelukt! De Spelen staan op je beginscherm.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__gevraagd)).toBe(true);
});

test("het menu heeft drie tabs: Thuis, Programma en Prikbord", async ({ page }) => {
  await loggedIn(page);
  const menu = page.getByRole("navigation", { name: "Hoofdmenu" });
  await expect(menu.getByRole("link")).toHaveCount(3);
  await expect(menu.getByRole("link", { name: "Thuis" })).toHaveAttribute("aria-current", "page");

  const tabs: [string, RegExp][] = [
    ["Programma", /\/programma$/],
    ["Prikbord", /\/prikbord$/],
  ];
  for (const [name, url] of tabs) {
    await menu.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(menu.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
  await menu.getByRole("link", { name: "Thuis" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("de privacytekst is ook zonder code te lezen", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Wat we bewaren" })).toBeVisible();
  await expect(page.getByText("Geen e-mailadres, geen telefoonnummer, geen adres.")).toBeVisible();
});

test("een onbekende pagina geeft een nette foutpagina", async ({ page }) => {
  await loggedIn(page);
  const response = await page.goto("/bestaat-niet");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Deze baan bestaat niet" })).toBeVisible();
});
