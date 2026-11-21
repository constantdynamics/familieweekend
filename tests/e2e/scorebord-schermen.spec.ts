/**
 * Every screen of the scoreboard, the zeskamp, the spelleider and the game
 * helper: accessibility (axe, WCAG 2.2 AA), no lonely words, no sideways
 * scrolling, and screenshots per viewport in docs/screenshots/fase-2-4/.
 * The ceremony screens are in ceremonie.spec.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { resetState } from "./helpers";
import {
  binnen,
  check,
  loginBeheerder,
  loginCaptain,
  loginSpelleider,
  maakSpelleider,
  maakTeamPin,
  nieuwToestel,
  onderdeelId,
  vrijdagPunten,
  ZONDER_SERVICE_WORKER,
} from "./zeskamp-hulp";

test.use({ reducedMotion: "reduce", ...ZONDER_SERVICE_WORKER });

test.beforeEach(async () => {
  await resetState();
});

/** The admin enters (or corrects) a result on the game's admin page. */
async function uitslag(admin: Page, spel: string, waarden: Record<string, string>) {
  await admin.goto(`/beheer/zeskamp/${spel}`);
  for (const [team, waarde] of Object.entries(waarden)) await admin.getByLabel(team, { exact: true }).fill(waarde);
  await admin.getByRole("button", { name: "Bewaar uitslag" }).click();
  await expect(admin.getByText("Uitslag bewaard. De oude waarden staan in het logboek.")).toBeVisible();
}

async function joker(admin: Page, spel: string, team: string) {
  await admin.goto(`/beheer/zeskamp/${spel}`);
  await admin.getByLabel("Zet de joker van").selectOption({ label: team });
  await admin.getByRole("button", { name: "Zet de joker op dit spel" }).click();
  await expect(admin.getByText(/De joker staat op/)).toBeVisible();
}

test("scorebord en zeskamp voor de familie", async ({ page, browser }, info) => {
  await binnen(page);
  await page.goto("/score");
  await expect(page.getByRole("heading", { name: "Nog geen punten" })).toBeVisible();
  await check(page, info, "50-score-leeg");

  const beheer = await nieuwToestel(browser, { reducedMotion: "reduce" });
  const admin = beheer.page;
  await binnen(admin);
  await loginBeheerder(admin);
  await vrijdagPunten(admin, { "Team Oranje": "8", "Team Mosterd": "5", "Team Avocado": "10", "Team Petrol": "6" });
  await admin.goto("/beheer/scorebord#punten");
  await admin.getByLabel("Team", { exact: true }).selectOption({ label: "Team Avocado" });
  await admin.getByLabel("Punten", { exact: true }).fill("-1,5");
  await admin.getByLabel("Reden", { exact: true }).fill("Voorzeggen bij het uitbeelden");
  await admin.getByRole("button", { name: "Bewaar de punten" }).click();
  await expect(admin.getByText("Punten afgetrokken van Team Avocado.")).toBeVisible();

  // Keep the scoreboard open while the first game is entered.
  await admin.goto("/beheer/scorebord");
  const automatisch = admin.getByRole("switch", { name: /Vanzelf dicht bij de start van het eerste\szeskampspel/ });
  await automatisch.click();
  await expect(automatisch).toHaveAttribute("aria-checked", "false");
  const taart = await onderdeelId("Taart in zeven");
  await joker(admin, taart, "Team Petrol");
  await uitslag(admin, taart, { "Team Oranje": "18", "Team Mosterd": "40", "Team Avocado": "12", "Team Petrol": "12" });

  await page.goto("/score");
  await expect(page.getByRole("tab", { name: "Klassement" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Stand na vrijdag en 1\szeskampspel/)).toBeVisible();
  await check(page, info, "51-score");
  await page.getByRole("listitem").filter({ hasText: "Team Avocado" }).locator("summary").click();
  await expect(page.getByText(/Voorzeggen bij het/)).toBeVisible();
  await check(page, info, "52-score-opbouw");
  await page.getByRole("tab", { name: "Medaillespiegel" }).click();
  await expect(page.getByRole("table", { name: /Medaillespiegel/ })).toBeVisible();
  await check(page, info, "53-score-medailles");

  await page.goto("/zeskamp");
  await expect(page.getByRole("list", { name: /Uitslag van Taart in zeven/ })).toContainText("Team Petrol");
  await check(page, info, "55-zeskamp");

  // The lock closes; a second game is played after it.
  await admin.goto("/beheer/scorebord");
  await admin.getByRole("button", { name: "Zet het slot nu dicht" }).click();
  await expect(admin.getByText("Het slot is dicht. De stand van nu is bewaard.")).toBeVisible();
  await check(admin, info, "68-beheer-scorebord");
  const lekke = await onderdeelId("Lekke-bekerestafette");
  await uitslag(admin, lekke, { "Team Oranje": "31", "Team Mosterd": "12,5", "Team Avocado": "40,5", "Team Petrol": "22" });
  await check(admin, info, "70-beheer-spel");

  await page.goto("/score");
  await expect(page.getByText(/Op slot tot de prijsuitreiking/)).toBeVisible();
  await expect(page.getByText(/Gespeeld, punten volgen/)).toBeVisible();
  await check(page, info, "54-score-op-slot");

  const captainPin = await maakTeamPin(admin, "Team Oranje");
  const captain = await nieuwToestel(browser, { reducedMotion: "reduce" });
  await loginCaptain(captain.page, captainPin);
  await captain.page.goto("/zeskamp");
  await expect(captain.page.getByRole("heading", { name: "Jullie joker" })).toBeVisible();
  await check(captain.page, info, "56-zeskamp-captain");

  await admin.goto("/beheer/zeskamp");
  await check(admin, info, "69-beheer-zeskamp");

  await beheer.context.close();
  await captain.context.close();
});

test("de spelleider: elk uitslagtype, versturen en de spelhulp", async ({ page, browser }, info) => {
  await binnen(page);
  await loginBeheerder(page);
  const pin = await maakSpelleider(page, "Kees");
  // Three extra games, so every result type is on screen.
  const nieuw: [string, string][] = [
    ["Ballen in de emmer", "Tellen, meeste wint"],
    ["Beeld van aluminiumfolie", "Jurycijfer, hoogste wint"],
    ["Hindernisbaan", "Volgorde aantikken"],
  ];
  const ids: Record<string, string> = {};
  for (const [naam, type] of nieuw) {
    await page.goto("/beheer/zeskamp");
    await page.getByText("Voeg een spel toe").click();
    await page.getByLabel("Naam", { exact: true }).fill(naam);
    await page.getByLabel("Uitslagtype").selectOption({ label: type });
    await page.getByRole("button", { name: "Voeg spel toe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: naam })).toBeVisible();
    ids[naam] = page.url().split("/").at(-1)!;
  }

  const spelleider = await nieuwToestel(browser, { reducedMotion: "reduce" });
  const sl = spelleider.page;
  await loginSpelleider(sl, pin, "Kees");
  await sl.goto("/spelleider/zeskamp");
  await check(sl, info, "57-spelleider-spellen");

  // All teams at once, against the clock.
  await sl.goto(`/spelleider/zeskamp/${await onderdeelId("Zaklopen-estafette")}`);
  await expect(sl.getByRole("button", { name: "Start de tijd" })).toBeVisible();
  await check(sl, info, "58-spelleider-tijd");
  await sl.getByRole("button", { name: "Start de tijd" }).click();
  for (const kleur of ["Petrol", "Oranje", "Mosterd", "Avocado"]) await sl.getByRole("button", { name: new RegExp(`Stop ${kleur}`) }).click();
  await expect(sl.getByText("Alle teams binnen, controleer en verstuur")).toBeVisible();
  await check(sl, info, "59-spelleider-tijd-binnen");

  // One after the other.
  await sl.goto(`/spelleider/zeskamp/${await onderdeelId("Blind parcours met dierengeluiden")}`);
  await sl.getByRole("button", { name: "Start Team Oranje" }).click();
  await sl.getByRole("button", { name: "Stop Team Oranje" }).click();
  await check(sl, info, "60-spelleider-na-elkaar");

  // Measurements.
  await sl.goto(`/spelleider/zeskamp/${await onderdeelId("Taart in zeven")}`);
  await sl.getByRole("button", { name: "Start het spel" }).click();
  for (const [team, waarde] of [
    ["Team Oranje", "18"],
    ["Team Mosterd", "40"],
    ["Team Avocado", "12,5"],
  ]) {
    await sl.getByLabel(team).fill(waarde);
  }
  await check(sl, info, "61-spelleider-meting");
  await sl.getByLabel("Team Petrol").fill("25");
  await sl.getByRole("button", { name: "Verstuur uitslag" }).click();
  await expect(sl.getByText(/Uitslag verstuurd/)).toBeVisible({ timeout: 15_000 });
  await check(sl, info, "65-spelleider-verstuurd");

  // Counting.
  await sl.goto(`/spelleider/zeskamp/${ids["Ballen in de emmer"]}`);
  await sl.getByRole("button", { name: "Start het spel" }).click();
  for (const [team, keer] of [
    ["Team Oranje", 3],
    ["Team Mosterd", 5],
    ["Team Avocado", 3],
    ["Team Petrol", 1],
  ] as const) {
    for (let i = 0; i < keer; i += 1) await sl.getByRole("button", { name: `Eén erbij voor ${team}` }).click();
  }
  await check(sl, info, "62-spelleider-tellen");

  // Jury marks.
  await sl.goto(`/spelleider/zeskamp/${ids["Beeld van aluminiumfolie"]}`);
  await sl.getByRole("button", { name: "Start het spel" }).click();
  await sl.getByRole("textbox", { name: /^Team\sOranje/ }).fill("8");
  await sl.getByRole("textbox", { name: /^Team\sMosterd/ }).fill("7,5");
  await sl.getByRole("button", { name: "Eén punt hoger voor Team Avocado" }).click();
  await check(sl, info, "63-spelleider-jury");

  // Tapping the finishing order, with a shared place.
  await sl.goto(`/spelleider/zeskamp/${ids["Hindernisbaan"]}`);
  await sl.getByRole("button", { name: "Start het spel" }).click();
  await sl.getByRole("button", { name: /Team Mosterd/ }).click();
  await sl.getByLabel(/Het volgende team deelt de plaats met het\svorige/).check();
  await sl.getByRole("button", { name: /Team Petrol/ }).click();
  await check(sl, info, "64-spelleider-volgorde");

  // The game helper.
  await sl.goto("/spelleider/spelhulp");
  await sl.getByLabel("Naam van de stapel").fill("Omgekeerd uitbeelden");
  await sl.getByLabel("Kaartjes, één per regel").fill("Een kameel\nFietsband plakken\nDe Eiffeltoren\nEen ijsbeer op vakantie");
  await sl.getByRole("button", { name: "Bewaar kaartjes" }).click();
  await expect(sl.getByText("4 kaartjes bewaard.")).toBeVisible();
  await check(sl, info, "66-spelhulp");
  await sl.getByRole("button", { name: /Speel met Omgekeerd uitbeelden/ }).click();
  await expect(sl.getByRole("timer")).toHaveText("1:00");
  await sl.getByRole("button", { name: "Geraden", exact: true }).click();
  await sl.getByRole("button", { name: "Geraden", exact: true }).click();
  await sl.getByRole("button", { name: "Volgende" }).click();
  await expect(sl.getByText("4 van 4")).toBeVisible();
  await check(sl, info, "67-spelhulp-spel");

  await spelleider.context.close();
});
