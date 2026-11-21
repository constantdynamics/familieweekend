/**
 * The quiz in beheer (SPEC §4.6 "Invoer van vragen", §4.11): the rounds,
 * the question editor with the reminder for young and old, the fairness
 * check, the maximum points per round, importing a quiz file (in beheer and
 * with `npm run import:quiz`) and exporting it as a backup.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { loggedIn, loginAdmin, resetState } from "./helpers";
import { adminInDeProef, check, zetProefKlaar } from "./quizHulp";

test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

test.beforeEach(async () => {
  await resetState();
});

const QUIZ = {
  titel: "De Grote Valkenburger Quiz",
  rondes: [
    {
      nummer: 1,
      titel: "Familie in cijfers",
      intro: "Totaalvragen over de hele familie.",
      luistermodus: false,
      intermezzo_na: false,
      vragen: [
        { id: "r1v1", type: "meerkeuze", vraag: "Hoeveel van ons hebben ooit iets gebroken?", opties: ["9", "14", "17", "23"], goed: 2, uitleg: "17 van de 45 familieleden brak ooit iets." },
        { id: "r1v2", type: "waar_niet_waar", vraag: "Waar of niet waar: meer dan de helft van ons drinkt koffie.", goed: true },
      ],
    },
    {
      nummer: 2,
      titel: "Waar ligt Valkenburg?",
      vragen: [
        { id: "r2v1", type: "kaart", vraag: "Waar ligt Valkenburg aan de Geul?", antwoord: { lat: 50.865, lng: 5.832 }, schaal: "nederland" },
        { id: "r2v2", type: "kaart", vraag: "Waar ligt Falkenberg?", antwoord: { lat: 56.9055, lng: 12.4912 }, schaal: "wereld" },
      ],
    },
    {
      nummer: 3,
      titel: "Muziek",
      luistermodus: true,
      intermezzo_na: true,
      vragen: [
        { id: "r3v1", type: "wie_van_ons", vraag: "Van wie is dit het lievelingsnummer?", opties: ["Oom Kees", "Tante Marijke"], goed: 1, notitie: "Start op Spotify: playlist Quiz ronde 3, nummer 1" },
        { id: "r3v2", type: "wie_van_ons", vraag: "En dit nummer?", opties: ["Oom Kees", "Tante Marijke"], goed: 1 },
      ],
    },
  ],
};

test("de beheerder maakt de quiz, leest een bestand in, bewerkt een vraag en maakt een backup", async ({ page }) => {
  test.setTimeout(120_000);
  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/quiz");
  await expect(page.getByRole("heading", { name: "Begin met de quiz" })).toBeVisible();
  await check(page, "80-beheer-quiz-leeg");

  await page.getByRole("button", { name: "Maak de vijf rondes" }).click();
  await expect(page.getByRole("link", { name: /Hemelvaart, lente en de/ })).toBeVisible();

  // A broken file: clear Dutch errors, and nothing changes.
  const kapot = structuredClone(QUIZ) as unknown as { rondes: { vragen: Record<string, unknown>[] }[] };
  kapot.rondes[0].vragen[0].goed = 7;
  kapot.rondes[1].vragen[0].schaal = "heelal";
  await page.getByLabel("Quizbestand (JSON)").setInputFiles({ name: "quiz.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(kapot)) });
  await page.getByRole("button", { name: "Lees de quiz in" }).click();
  await expect(page.getByText(/Het bestand is niet ingelezen\. Dit moet eerst\sanders:/)).toBeVisible();
  await expect(page.getByText(/Ronde 1, vraag 1 \(r1v1\), goed: goed is het nummer van de goede optie: 0 voor de eerste, 3 voor de\slaatste\./)).toBeVisible();
  await expect(page.getByText(/Ronde 2, vraag 1 \(r2v1\), schaal: schaal is nederland of\swereld\./)).toBeVisible();
  await check(page, "81-beheer-quiz-import-fouten");

  // The right file.
  await page.getByLabel("Quizbestand (JSON)").setInputFiles({ name: "quiz.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(QUIZ)) });
  await page.getByRole("button", { name: "Lees de quiz in" }).click();
  await expect(page.getByText(/Quiz ingelezen: 3 rondes, 6 vragen/)).toBeVisible();
  // The participants list is still empty, so the names are not checked yet.
  await expect(page.getByText(/De deelnemerslijst is nog leeg/)).toBeVisible();
  await check(page, "82-beheer-quiz-ingelezen");

  // The overview: maximum points, a warning for the heavy map round, and the fairness check.
  await page.goto("/beheer/quiz");
  await expect(page.getByRole("link", { name: /Waar ligt Valkenburg\?/ })).toContainText(/maximaal 6\spunten/);
  await expect(page.getByText(/Ronde 2 \(Waar ligt Valkenburg\?\) kan 6 punten opleveren/)).toBeVisible();
  await expect(page.getByText(/Niet in de deelnemerslijst: Tante\sMarijke/)).toBeVisible();
  await check(page, "83-beheer-quiz-overzicht");

  // A round, and the editor of one question.
  await page.getByRole("link", { name: /Familie in\scijfers/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ronde 1" })).toBeVisible();
  await expect(page.getByText("Kan een kind van 10 dit beredeneren?").first()).toBeVisible();
  await check(page, "84-beheer-quiz-ronde");
  await page.getByRole("link", { name: "Bewerk" }).first().click();
  await expect(page.getByText(/Kan een kind van 10 dit beredeneren\?/).filter({ visible: true }).first()).toBeVisible();
  await check(page, "85-beheer-quiz-vraag");
  // Next keeps pages that were visited mounted but hidden: only look at what is on screen.
  const zichtbaar = (locator: Locator) => locator.filter({ visible: true }).first();
  await zichtbaar(page.getByLabel("Vraag", { exact: true })).fill("Hoeveel van ons hebben ooit een been gebroken?");
  await zichtbaar(page.getByRole("button", { name: "Bewaar de vraag" })).click();
  await expect(zichtbaar(page.getByText(/Hoeveel van ons hebben ooit een been\sgebroken\?/))).toBeVisible();

  // A new map question; a mistake first.
  await zichtbaar(page.getByRole("link", { name: "Voeg een vraag toe" })).click();
  await zichtbaar(page.getByLabel("Soort vraag")).selectOption("kaart");
  await zichtbaar(page.getByLabel("Vraag", { exact: true })).fill("Waar ligt Valkenswaard?");
  await zichtbaar(page.getByLabel("Breedtegraad")).fill("123");
  await zichtbaar(page.getByLabel("Lengtegraad")).fill("5,46");
  await zichtbaar(page.getByRole("button", { name: "Bewaar de vraag" })).click();
  await expect(zichtbaar(page.getByText(/Vul een geldige plek in/))).toBeVisible();
  await zichtbaar(page.getByLabel("Breedtegraad")).fill("51,35");
  await zichtbaar(page.getByRole("button", { name: "Bewaar de vraag" })).click();
  await expect(zichtbaar(page.getByText(/Waar ligt\sValkenswaard\?/))).toBeVisible();
  await expect(zichtbaar(page.getByText(/Goed: 51,35° N, 5,46° O\s\(nederland\)/))).toBeVisible();

  // The backup has the change.
  const backup = await page.request.get("/api/quiz/export");
  expect(backup.headers()["content-disposition"]).toMatch(/attachment; filename="quiz-\d{4}-\d{2}-\d{2}\.json"/);
  const bestand = await backup.json();
  expect(bestand.rondes[0].vragen.map((v: { vraag: string }) => v.vraag)).toEqual([
    "Hoeveel van ons hebben ooit een been gebroken?",
    "Waar of niet waar: meer dan de helft van ons drinkt koffie.",
    "Waar ligt Valkenswaard?",
  ]);
  expect(bestand.rondes[2].vragen[0].notitie).toBe("Start op Spotify: playlist Quiz ronde 3, nummer 1");

  // The logbook names the changes.
  await page.goto("/beheer/logboek");
  await expect(page.getByText("Quiz geïmporteerd").first()).toBeVisible();
  await expect(page.getByText("Quizvraag gewijzigd").first()).toBeVisible();
});

test("npm run import:quiz leest een bestand in vanaf de opdrachtregel", async ({ page }) => {
  const map = mkdtempSync(path.join(tmpdir(), "quiz-"));
  const bestand = path.join(map, "quiz.json");
  writeFileSync(bestand, JSON.stringify(QUIZ));
  const uitvoer = execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/import-quiz.ts", bestand], {
    env: { ...process.env, MIGRATION_DATABASE_URL: E2E.adminUrl },
    encoding: "utf8",
  });
  expect(uitvoer).toContain("Quiz ingelezen: 3 rondes, 6 vragen.");

  writeFileSync(bestand, JSON.stringify({ ...QUIZ, rondes: [{ nummer: 1, titel: "Kapot", vragen: [{ type: "meerkeuze", vraag: "?" }] }] }));
  let fout = "";
  try {
    execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/import-quiz.ts", bestand], {
      env: { ...process.env, MIGRATION_DATABASE_URL: E2E.adminUrl },
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    fout = String((error as { stderr?: string }).stderr);
  }
  expect(fout).toContain("Ronde 1, vraag 1, opties: Bij dit type horen 2 tot 4 opties.");

  await loggedIn(page);
  await loginAdmin(page);
  await page.goto("/beheer/quiz");
  await expect(page.getByRole("link", { name: /Muziek/ })).toContainText(/luistermodus, daarna het\sintermezzo/);
});

test("de demo-quiz staat klaar in de proef", async ({ page }) => {
  await adminInDeProef(page);
  await zetProefKlaar(page);
  await page.goto("/beheer/quiz?quiz=demo");
  await expect(page.getByText(/Proefquiz: De Kleine Valkenburger: 5\srondes, 12\svragen\./)).toBeVisible();
  await expect(page.getByText(/Voorkennis per team: Oranje\s1, Mosterd\s1, Avocado\s1, Petrol\s0 \(hele\squiz\)\./)).toBeVisible();
  await check(page, "86-beheer-demo-quiz");
});
