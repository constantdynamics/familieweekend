/**
 * Fun facts (SPEC §4.2, §4.6 Echt of AI, §4.11): filling in one question per
 * screen, the privacy promise (nobody else gets your answers or photos, not
 * even through the API), the window before the opening and after the
 * deadline, the counter on Thuis, and the admin screens. Screenshots of every
 * screen go to docs/screenshots/fase-2-4/<viewport>/.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type postgres from "postgres";
import { E2E } from "../../playwright.config";
import { hmacSha256, toBase64Url } from "../../src/lib/server/keys";
import { db, enterFamilyCode, losseWoorden, resetState, tryAdminPin } from "./helpers";

test.use({ reducedMotion: "reduce" });

let sql: postgres.Sql;

test.beforeEach(async () => {
  await resetState();
  sql = db();
});

test.afterEach(async () => {
  await sql.end();
});

async function check(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // After a server action the metadata streams in again; wait until the page has settled.
  await expect(page).toHaveTitle(/Valkenburger Spelen/);
  const analyze = () =>
    new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  let results = await analyze();
  if (results.violations.some((v) => v.id === "document-title")) {
    // The title can be gone for a moment while it streams in again; then measure once more.
    await expect(page).toHaveTitle(/Valkenburger Spelen/);
    results = await analyze();
  }
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

/** The app keeps the settings cached; the keepalive refreshes them (and the counter on Thuis). */
async function ververs() {
  const response = await fetch(`http://localhost:${E2E.port}/api/keepalive`, {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  expect(response.ok).toBe(true);
}

async function lijstOpen() {
  await sql`update valk.settings set funfacts_open_at = now() - interval '1 day', funfacts_deadline = now() + interval '30 days' where id = 1`;
  await ververs();
}

async function lijstDicht() {
  await sql`update valk.settings set funfacts_open_at = now() - interval '60 days', funfacts_deadline = now() - interval '1 day' where id = 1`;
  await ververs();
}

/** Five questions, one of each kind, so a test runs through the whole list quickly. */
async function korteLijst() {
  await sql`update valk.funfact_questions set active = sort in (1, 12, 18, 23, 24)`;
}

async function vraagId(sort: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`select id from valk.funfact_questions where sort = ${sort}`;
  return row.id;
}

async function voegNamenToe(...namen: string[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const naam of namen) {
    const [row] = await sql<{ id: string }[]>`insert into valk.participants (env, name) values ('live', ${naam}) returning id`;
    ids[naam] = row.id;
  }
  await ververs();
  return ids;
}

/** A photo upload for someone, straight in the database, plus the answer that points at it. */
async function fotoVoor(participantId: string): Promise<string> {
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync("public/icons/icon-192.png");
  const [upload] = await sql<{ id: string }[]>`
    insert into valk.uploads (kind, participant_id, mime, bytes, width, height, size_bytes, created_by)
    values ('funfact', ${participantId}, 'image/png', ${bytes}, 192, 192, ${bytes.length}, 'test')
    returning id
  `;
  await sql`
    insert into valk.funfact_answers (participant_id, question_id, value, skipped)
    values (${participantId}, ${await vraagId(24)}, ${sql.json({ upload: upload.id })}, false)
  `;
  return upload.id;
}

async function antwoord(participantId: string, sort: number, value: postgres.JSONValue | null) {
  await sql`
    insert into valk.funfact_answers (participant_id, question_id, value, skipped)
    values (${participantId}, ${await vraagId(sort)}, ${value === null ? null : sql.json(value)}, ${value === null})
  `;
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
    reducedMotion: "reduce",
  });
  return { context, page: await context.newPage() };
}

/**
 * Typing right after a page load can land before the form is ready (seen on a
 * busy machine): then try again.
 */
async function voerCodeIn(page: Page, url: RegExp) {
  await expect(async () => {
    if (!url.test(page.url())) await enterFamilyCode(page);
    await expect(page).toHaveURL(url, { timeout: 4000 });
  }).toPass({ timeout: 30_000 });
}

async function alsBeheerder(page: Page) {
  await voerCodeIn(page, /\/$/);
  const ingelogd = page.getByText(/^Ingelogd als /);
  await expect(async () => {
    if (!(await ingelogd.isVisible())) await tryAdminPin(page, E2E.adminPin);
    await expect(ingelogd).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 30_000 });
}

/** Enter the family code and choose a name (the app asks for it once names exist). */
async function kiesNaam(page: Page, ...namen: string[]) {
  await voerCodeIn(page, /\/wie-ben-jij/);
  for (const naam of namen) {
    await page.getByRole("button", { name: naam }).click();
    await expect(page.getByText(`Gelukt! Deze telefoon hoort nu bij ${naam}.`)).toBeVisible();
  }
}

test("je vult je fun facts in: één vraag per scherm, overslaan, terug en klaar", async ({ page }, info) => {
  await lijstOpen();
  await korteLijst();
  const ids = await voegNamenToe("Sanne Valkenburg", "Tim Valkenburg", "Oma Riet");
  await kiesNaam(page, "Sanne Valkenburg");

  await page.goto("/funfacts");
  await expect(page.getByRole("heading", { level: 1, name: "Je fun facts" })).toBeVisible();
  await expect(page.getByText("5 luchtige vragen voor de quiz")).toBeVisible();
  await check(page, info, "01-funfacts-start");

  await page.getByRole("button", { name: "Begin met vraag 1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Heb je ooit iets\sgebroken\?/ })).toBeVisible();
  await expect(page.getByText("Vraag 1 van 5")).toBeVisible();
  // The bar of the questions replaces the menu.
  await expect(page.getByRole("navigation", { name: "Hoofdmenu" })).toBeHidden();
  await page.getByRole("button", { name: "Ja", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ja", exact: true })).toHaveAttribute("aria-pressed", "true");
  await check(page, info, "02-funfacts-ja-nee");
  await page.getByRole("button", { name: "Volgende" }).click();

  // A number: the stepper, typing, and a friendly no for a number outside the range.
  await expect(page.getByRole("heading", { level: 1, name: /In hoeveel landen ben je ooit\sgeweest\?/ })).toBeVisible();
  const getal = page.getByRole("textbox", { name: /In hoeveel landen/ });
  await page.getByRole("button", { name: "Eén meer" }).click();
  await page.getByRole("button", { name: "Eén meer" }).click();
  await expect(getal).toHaveValue("1");
  await getal.fill("250");
  await page.getByRole("button", { name: "Volgende" }).click();
  await expect(page.getByText("Kies een getal van 0 tot 200.")).toBeVisible();
  await getal.fill("12");
  await check(page, info, "03-funfacts-getal");
  await page.getByRole("button", { name: "Volgende" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Koffie of thee?" })).toBeVisible();
  await page.getByRole("button", { name: "Thee", exact: true }).click();
  await check(page, info, "04-funfacts-keuze");
  await page.getByRole("button", { name: "Volgende" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Wat is je\slievelingsnummer\?/ })).toBeVisible();
  await page.getByLabel("Jouw antwoord").fill("Dancing Queen, ABBA");
  await check(page, info, "05-funfacts-open");
  // Back: the typed answer is saved first, and the earlier choice is still there.
  await page.getByRole("button", { name: "Vorige" }).click();
  await expect(page.getByRole("button", { name: "Thee", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Volgende" }).click();
  await expect(page.getByLabel("Jouw antwoord")).toHaveValue("Dancing Queen, ABBA");
  await page.getByRole("button", { name: "Volgende" }).click();

  // The photo: made smaller in the browser, uploaded and saved at once.
  await expect(page.getByRole("heading", { level: 1, name: /Upload je meest merkwaardige\sfoto/ })).toBeVisible();
  await check(page, info, "06-funfacts-foto");
  await page.getByLabel(/Kies een foto/).setInputFiles("public/icons/icon-192.png");
  await expect(page.getByRole("img", { name: "Jouw foto" })).toBeVisible();
  await check(page, info, "07-funfacts-foto-gekozen");
  await page.getByRole("button", { name: "Rond af" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Klaar, dank je wel!" })).toBeVisible();
  await check(page, info, "08-funfacts-klaar");

  // Everything is in the database, in the agreed shapes, and Sanne is done.
  const rows = await sql<{ sort: number; value: Record<string, unknown> | null; skipped: boolean }[]>`
    select q.sort, a.value, a.skipped from valk.funfact_answers a
    join valk.funfact_questions q on q.id = a.question_id
    where a.participant_id = ${ids["Sanne Valkenburg"]} order by q.sort
  `;
  expect(rows.map((r) => [r.sort, r.value, r.skipped])).toEqual([
    [1, { bool: true }, false],
    [12, { number: 12 }, false],
    [18, { choice: "Thee" }, false],
    [23, { text: "Dancing Queen, ABBA" }, false],
    [24, { upload: expect.stringMatching(/^[0-9a-f-]{36}$/) }, false],
  ]);
  const [upload] = await sql<{ kind: string; participant_id: string; mime: string }[]>`
    select kind, participant_id, mime from valk.uploads where id = ${String(rows[4].value?.upload)}
  `;
  expect(upload).toEqual({ kind: "funfact", participant_id: ids["Sanne Valkenburg"], mime: "image/jpeg" });
  const [sanne] = await sql<{ done: boolean }[]>`
    select funfacts_done_at is not null as done from valk.participants where id = ${ids["Sanne Valkenburg"]}
  `;
  expect(sanne.done).toBe(true);

  // Your own answers come back, and you can change one.
  await page.getByRole("button", { name: "Bekijk je antwoorden" }).click();
  await expect(page.getByRole("heading", { name: "Je bent klaar!" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jouw antwoorden" })).toBeVisible();
  await check(page, info, "09-funfacts-overzicht");
  await page.getByRole("button", { name: /Vraag 3/ }).click();
  await page.getByRole("button", { name: "Koffie", exact: true }).click();
  await page.getByRole("button", { name: "Bewaar" }).click();
  const derde = page.getByRole("button", { name: /Vraag 3\s*Koffie\sof\sthee\?\s*Koffie\s*Pas aan/ });
  await expect(derde).toBeVisible();

  // Reopening the app shows the overview with the saved answers.
  await page.reload();
  await expect(derde).toBeVisible();

  // The counter on Thuis follows at once.
  await page.goto("/");
  const kaart = page.getByRole("region", { name: "Vul je fun facts in" });
  await expect(kaart.getByText(/1 van de 3 familieleden is\sklaar/)).toBeVisible();
  await expect(kaart.getByRole("link", { name: "Open de vragenlijst" })).toBeVisible();
  await check(page, info, "10-thuis-funfacts-open");
});

test("halverwege stoppen en later verdergaan; overslaan telt ook", async ({ page }) => {
  await lijstOpen();
  await korteLijst();
  const ids = await voegNamenToe("Sanne Valkenburg");
  await kiesNaam(page, "Sanne Valkenburg");
  await page.goto("/funfacts");
  await page.getByRole("button", { name: "Begin met vraag 1" }).click();
  await page.getByRole("button", { name: "Sla over" }).click();
  await expect(page.getByText("Vraag 2 van 5")).toBeVisible();
  // The phone "dies": open the app again.
  await page.goto("/funfacts");
  await expect(page.getByText(/1 van de 5 vragen gedaan/)).toBeVisible();
  await page.getByRole("button", { name: "Ga verder met vraag 2" }).click();
  await expect(page.getByText("Vraag 2 van 5")).toBeVisible();
  for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "Sla over" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Klaar, dank je wel!" })).toBeVisible();
  const [row] = await sql<{ skipped: number; done: boolean }[]>`
    select (select count(*)::int from valk.funfact_answers where participant_id = p.id and skipped and value is null) as skipped,
      p.funfacts_done_at is not null as done
    from valk.participants p where p.id = ${ids["Sanne Valkenburg"]}
  `;
  expect(row).toEqual({ skipped: 5, done: true });
});

test("privacy: een ander toestel krijgt jouw antwoorden en foto's nergens te zien", async ({ page, browser }) => {
  await lijstOpen();
  await korteLijst();
  const ids = await voegNamenToe("Sanne Valkenburg", "Tim Valkenburg");
  const sanne = ids["Sanne Valkenburg"];
  const tim = ids["Tim Valkenburg"];
  await antwoord(sanne, 23, { text: "Geheimpje-van-Sanne-42" });
  const fotoId = await fotoVoor(sanne);

  // Sanne sees her own answer and photo.
  await kiesNaam(page, "Sanne Valkenburg");
  await page.goto("/funfacts");
  await expect(page.getByText("Geheimpje-van-Sanne-42")).toBeVisible();
  const fotoUrl = await page.getByRole("img", { name: "Jouw foto" }).getAttribute("src");
  expect(fotoUrl).toMatch(new RegExp(`^/api/foto/${fotoId}\\?t=\\d+&s=`));

  // Tim, on his own phone, gets nothing of it: not on the page, not with Sanne's id in the address.
  const b = await nieuwToestel(browser);
  await kiesNaam(b.page, "Tim Valkenburg");
  for (const pad of ["/funfacts", `/funfacts?voor=${sanne}`]) {
    await b.page.goto(pad);
    await expect(b.page.getByText(/Je vult in als/)).toContainText("Tim Valkenburg");
    const html = await b.page.content();
    expect(html).not.toContain("Geheimpje-van-Sanne-42");
    expect(html).not.toContain(fotoId);
  }

  // Not through the exports either: those are for the admin only.
  for (const bestand of ["funfacts.csv", "funfacts.json", "fotos.zip"]) {
    const response = await b.page.request.get(`/beheer/funfacts/export/${bestand}`);
    expect(response.status(), bestand).toBe(403);
    expect(await response.text()).not.toContain("Geheimpje-van-Sanne-42");
  }

  // Saving for Sanne from Tim's phone is refused by the server, even with a forged request.
  await b.page.route(
    (url) => url.pathname === "/funfacts",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.continue({ postData: (request.postData() ?? "").split(tim).join(sanne) });
      } else {
        await route.continue();
      }
    },
  );
  await b.page.goto("/funfacts");
  await b.page.getByRole("button", { name: "Begin met vraag 1" }).click();
  await b.page.getByRole("button", { name: "Ja", exact: true }).click();
  await b.page.getByRole("button", { name: "Volgende" }).click();
  await expect(b.page.getByText("Je kunt alleen invullen voor de namen op deze telefoon. Kies je naam opnieuw.")).toBeVisible();
  const [eerste] = await sql<{ n: number }[]>`
    select count(*)::int as n from valk.funfact_answers where question_id = ${await vraagId(1)}
  `;
  expect(eerste.n).toBe(0);

  // Photos only come with a signed link that expires.
  expect((await b.page.request.get(`/api/foto/${fotoId}`)).status()).toBe(403);
  expect((await b.page.request.get(`${fotoUrl}x`)).status()).toBe(403);
  process.env.APP_SECRET = E2E.appSecret;
  const teken = async (expires: number) =>
    `/api/foto/${fotoId}?t=${expires}&s=${toBase64Url(await hmacSha256("photo", `${fotoId}.${expires}`)).slice(0, 32)}`;
  const nu = Math.floor(Date.now() / 1000);
  expect((await b.page.request.get(await teken(nu + 300))).status()).toBe(200);
  const verlopen = await b.page.request.get(await teken(nu - 60));
  expect(verlopen.status()).toBe(403);
  expect(await verlopen.text()).toBe("Deze link is verlopen.");
  // Without the family code the photo route is closed altogether.
  const vreemde = await browser.newContext({ baseURL: `http://localhost:${E2E.port}` });
  expect((await vreemde.request.get(fotoUrl!)).status()).toBe(401);
  await vreemde.close();
  await b.context.close();
});

test("voor de opening, na de deadline, zonder naam en met meer namen", async ({ page, browser }, info) => {
  await korteLijst();
  const ids = await voegNamenToe("Sanne Valkenburg", "Tim Valkenburg", "Oma Riet");
  await antwoord(ids["Sanne Valkenburg"], 1, { bool: false });
  await sql`update valk.participants set funfacts_done_at = now() where id = ${ids["Oma Riet"]}`;
  await kiesNaam(page, "Sanne Valkenburg", "Tim Valkenburg");

  // Before the opening (1 January): a friendly wait.
  await page.goto("/funfacts");
  await expect(page.getByRole("heading", { name: "Vanaf 1 januari" })).toBeVisible();
  await check(page, info, "11-funfacts-voor-de-opening");

  // Open, with two names on this phone: first choose for whom.
  await lijstOpen();
  await page.goto("/funfacts");
  await expect(page.getByRole("heading", { level: 1, name: "Voor wie vul je in?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sanne Valkenburg.*1\svan\sde\s5/ })).toBeVisible();
  await check(page, info, "12-funfacts-voor-wie");
  await page.getByRole("link", { name: /Tim Valkenburg/ }).click();
  await expect(page.getByText(/Je vult in als/)).toContainText("Tim Valkenburg");
  await expect(page.getByRole("link", { name: /Sanne Valkenburg/ })).toBeVisible();

  // A phone without a name is sent to "Wie ben jij?".
  const zonder = await nieuwToestel(browser);
  await voerCodeIn(zonder.page, /\/wie-ben-jij/);
  await zonder.page.goto("/funfacts");
  await expect(zonder.page.getByRole("heading", { name: "Wie ben jij?" })).toBeVisible();
  await check(zonder.page, info, "13-funfacts-geen-naam");
  await zonder.page.getByRole("link", { name: "Kies je naam" }).click();
  await expect(zonder.page).toHaveURL(/\/wie-ben-jij\?terug=%2Ffunfacts|\/wie-ben-jij\?terug=\/funfacts/);
  await zonder.context.close();

  // After the deadline: read only, with a thank-you.
  await lijstDicht();
  await page.goto(`/funfacts?voor=${ids["Sanne Valkenburg"]}`);
  await expect(page.getByText("De lijst is gesloten, dank je wel!")).toBeVisible();
  await expect(page.getByRole("button", { name: /Pas aan/ })).toHaveCount(0);
  await expect(page.getByText(/Nee/).first()).toBeVisible();
  await check(page, info, "14-funfacts-gesloten");

  // Thuis says the same, with the counter.
  await page.goto("/");
  const kaart = page.getByRole("region", { name: "Je fun facts" });
  await expect(kaart.getByText("De lijst is gesloten, dank je wel!")).toBeVisible();
  await expect(kaart.getByText(/1 van de 3 familieleden is\sklaar/)).toBeVisible();
  await check(page, info, "15-thuis-funfacts-gesloten");
});

test("beheer: vragen, voortgang, statistieken, conceptvraag en export", async ({ page }, info) => {
  await alsBeheerder(page);
  await lijstOpen();
  const ids = await voegNamenToe("Sanne Valkenburg", "Tim Valkenburg", "Oma Riet");
  await antwoord(ids["Sanne Valkenburg"], 1, { bool: true });
  await antwoord(ids["Tim Valkenburg"], 1, { bool: true });
  await antwoord(ids["Oma Riet"], 1, { bool: false });
  await antwoord(ids["Sanne Valkenburg"], 12, { number: 23 });
  await antwoord(ids["Tim Valkenburg"], 12, { number: 7 });
  await antwoord(ids["Oma Riet"], 12, null);
  await antwoord(ids["Sanne Valkenburg"], 23, { text: "Dancing Queen, ABBA" });
  await fotoVoor(ids["Sanne Valkenburg"]);
  await sql`update valk.participants set funfacts_done_at = now() where id = ${ids["Oma Riet"]}`;

  await page.goto("/beheer/funfacts");
  await expect(page.getByRole("heading", { name: /1 van de 3 familieleden is\sklaar/ })).toBeVisible();
  await expect(page.getByText("1 klaar, 2 bezig, 0 nog niet begonnen.")).toBeVisible();
  await check(page, info, "16-beheer-funfacts");

  // Change a question.
  await page.getByRole("link", { name: "Wijzig vraag 1", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vraag wijzigen" })).toBeVisible();
  await expect(page.getByText("Er zijn al antwoorden, dus de soort ligt vast.")).toBeVisible();
  await page.getByLabel("Uitleg").fill("Een arm, een been of een teen: alles telt.");
  await check(page, info, "17-beheer-funfacts-vraag");
  await page.getByRole("button", { name: "Bewaar vraag" }).click();
  await expect(page).toHaveURL(/\/beheer\/funfacts#vragen$/);
  const [eerste] = await sql<{ hint: string }[]>`select hint from valk.funfact_questions where sort = 1`;
  expect(eerste.hint).toBe("Een arm, een been of een teen: alles telt.");

  // Add one, move it up, and remove it again (no answers yet).
  // A full page load: Next keeps the pages you visited mounted but hidden, so their fields are still in the DOM.
  await expect(page.getByRole("link", { name: "Nieuwe vraag" })).toHaveAttribute("href", "/beheer/funfacts/vragen/nieuw");
  await page.goto("/beheer/funfacts/vragen/nieuw");
  await page.getByLabel("Vraag", { exact: true }).fill("Wat is je lievelingsdier?");
  await page.getByLabel("Soort vraag").selectOption({ label: "Keuze" });
  await page.getByLabel("Antwoorden, één per regel").fill("Hond\nKat\nValk");
  await page.getByRole("button", { name: "Voeg vraag toe" }).click();
  await expect(page.getByText(/26\. Wat is je\slievelingsdier\?/)).toBeVisible();
  await page.getByRole("button", { name: "Zet vraag 26 een plek hoger" }).click();
  await expect(page.getByText(/25\. Wat is je\slievelingsdier\?/)).toBeVisible();
  const [dier] = await sql<{ sort: number; options: string[] }[]>`
    select sort, options from valk.funfact_questions where text = 'Wat is je lievelingsdier?'
  `;
  expect(dier).toEqual({ sort: 25, options: ["Hond", "Kat", "Valk"] });
  await page.goto(String(await page.getByRole("link", { name: "Wijzig vraag 25", exact: true }).getAttribute("href")));
  await page.getByRole("button", { name: "Verwijder vraag" }).click();
  await page.getByRole("button", { name: "Ja, verwijder de vraag" }).click();
  await expect(page).toHaveURL(/\/beheer\/funfacts#vragen$/);
  await expect(page.getByText(/lievelingsdier/)).toBeHidden();
  const [weg] = await sql<{ n: number }[]>`select count(*)::int as n from valk.funfact_questions where text = 'Wat is je lievelingsdier?'`;
  expect(weg.n).toBe(0);

  // Statistics, and a draft quiz question taken over with one tap.
  await page.goto("/beheer/funfacts/statistieken");
  const gebroken = page.getByRole("region", { name: /Heb je ooit iets\sgebroken\?/ });
  await expect(gebroken.getByText("3 antwoorden, 0 overgeslagen")).toBeVisible();
  await expect(gebroken.getByText("2 · 67%")).toBeVisible();
  await expect(page.getByRole("region", { name: /In hoeveel landen/ }).getByText("1 overgeslagen", { exact: false })).toBeVisible();
  await check(page, info, "18-beheer-funfacts-statistieken");
  const concept = gebroken.getByRole("region", { name: "Conceptvraag bij vraag 1" });
  await concept.getByRole("button", { name: "Neem over" }).click();
  await expect(concept.getByText(/Staat al in ronde 1: Familie in\scijfers\./)).toBeVisible();
  const quiz = await sql<{ title: string; rondes: number }[]>`
    select z.title, (select count(*)::int from valk.quiz_rounds r where r.quiz_id = z.id) as rondes
    from valk.quizzes z where not z.is_demo
  `;
  expect(quiz).toEqual([{ title: "De Grote Valkenburger Quiz", rondes: 5 }]);
  const [vraag] = await sql<{ kind: string; text: string; options: string[]; correct: number; explanation: string; subjects: unknown[]; sort: number; number: number }[]>`
    select q.kind, q.text, q.options, q.correct, q.explanation, q.subjects, q.sort, r.number
    from valk.quiz_questions q join valk.quiz_rounds r on r.id = q.round_id
  `;
  expect(vraag).toMatchObject({ kind: "meerkeuze", text: "Hoeveel van ons hebben ooit iets gebroken?", subjects: [], sort: 1, number: 1 });
  expect(vraag.options).toHaveLength(4);
  expect(vraag.options[vraag.correct]).toBe("2");
  expect(vraag.explanation).toBe("2 van de 3 familieleden zeiden ja op de vraag: Heb je ooit iets gebroken?");

  // Export: CSV, JSON and the photos as a zip.
  const csv = await page.request.get("/beheer/funfacts/export/funfacts.csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/attachment; filename="funfacts-\d{4}-\d{2}-\d{2}\.csv"/);
  const tekst = await csv.text();
  expect(tekst.startsWith("﻿Naam;Roepnaam;Team;Klaar;1. Heb je ooit iets gebroken?")).toBe(true);
  expect(tekst).toContain("Sanne Valkenburg;;;nee;ja;");
  expect(tekst).toContain("foto: 24-sanne-valkenburg.png");
  const json = await (await page.request.get("/beheer/funfacts/export/funfacts.json")).json();
  expect(json.deelnemers).toHaveLength(3);
  const sanne = json.deelnemers.find((d: { naam: string }) => d.naam === "Sanne Valkenburg");
  expect(sanne.antwoorden).toContainEqual({ nr: 23, vraag: "Wat is je lievelingsnummer?", antwoord: "Dancing Queen, ABBA", overgeslagen: false });
  const zip = await page.request.get("/beheer/funfacts/export/fotos.zip");
  expect(zip.status()).toBe(200);
  const bytes = await zip.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  expect(bytes.includes(Buffer.from("24-sanne-valkenburg.png"))).toBe(true);
  const [logboek] = await sql<{ n: number }[]>`select count(*)::int as n from valk.audit_log where action = 'funfacts.export'`;
  expect(logboek.n).toBe(3);
});

test("Echt of AI: de beheerder uploadt een AI-versie en kiest wat in de quiz komt", async ({ page }, info) => {
  await alsBeheerder(page);
  await lijstOpen();
  const ids = await voegNamenToe("Sanne Valkenburg");
  const origineel = await fotoVoor(ids["Sanne Valkenburg"]);

  await page.goto("/beheer/funfacts/fotos");
  const kaart = page.getByRole("region", { name: "Foto van Sanne Valkenburg" });
  await expect(kaart.getByRole("img", { name: "De echte foto van Sanne Valkenburg" })).toBeVisible();
  await expect(kaart.getByRole("button", { name: "AI-versie", exact: true })).toBeDisabled();
  await check(page, info, "19-beheer-echt-of-ai");

  await kaart.getByLabel(/Upload de\s*AI-versie/).setInputFiles("public/icons/icon-512.png");
  await expect(kaart.getByRole("img", { name: "De AI-versie van de foto van Sanne Valkenburg" })).toBeVisible();
  await kaart.getByRole("button", { name: "AI-versie", exact: true }).click();
  await expect(kaart.getByText(/Goed antwoord in de quiz:\sAI\./)).toBeVisible();
  let [rij] = await sql<{ quiz_variant: string | null; ai: number }[]>`
    select u.quiz_variant, (select count(*)::int from valk.uploads x where x.original_id = u.id and x.kind = 'ai') as ai
    from valk.uploads u where u.id = ${origineel}
  `;
  expect(rij).toEqual({ quiz_variant: "ai", ai: 1 });

  await kaart.getByRole("button", { name: "Echt", exact: true }).click();
  await expect(kaart.getByText(/Goed antwoord in de quiz:\sEcht\./)).toBeVisible();
  await check(page, info, "20-beheer-echt-of-ai-gekozen");
  await kaart.getByRole("button", { name: "Verwijder de AI-versie" }).click();
  await expect(kaart.getByLabel(/Upload de\s*AI-versie/)).toBeAttached();
  [rij] = await sql<{ quiz_variant: string | null; ai: number }[]>`
    select u.quiz_variant, (select count(*)::int from valk.uploads x where x.original_id = u.id and x.kind = 'ai') as ai
    from valk.uploads u where u.id = ${origineel}
  `;
  expect(rij).toEqual({ quiz_variant: "echt", ai: 0 });
  const acties = await sql<{ action: string }[]>`select action from valk.audit_log where action like 'funfacts.%' order by id`;
  expect(acties.map((a) => a.action)).toEqual(["funfacts.ai", "funfacts.quizversie", "funfacts.quizversie", "funfacts.ai"]);
});

test("de proef krijgt voorbeeldantwoorden en foto's", async ({ page }) => {
  await alsBeheerder(page);
  await page.goto("/beheer/proef");
  await page.getByRole("button", { name: "Zet de proef klaar" }).click();
  await expect(page.getByText("PIN voor Proefteam Oranje")).toBeVisible();
  await page.getByRole("button", { name: "Ga de proef in op deze telefoon" }).click();
  await expect(page.getByText("Je zit in de proef", { exact: true })).toBeVisible();

  await page.goto("/beheer/funfacts");
  await expect(page.getByRole("heading", { name: /9 van de 12 familieleden zijn\sklaar/ })).toBeVisible();
  await expect(page.getByText(/Wijzigen kan buiten de\sproef\./)).toBeVisible();
  await page.goto("/beheer/funfacts/fotos");
  await expect(page.getByRole("img", { name: /De echte foto van/ })).toHaveCount(4);
  await page.goto("/beheer/funfacts/statistieken");
  await expect(page.getByText(/Overnemen in de echte quiz kan buiten de\sproef\./).first()).toBeVisible();
  // The real Spelen stay untouched.
  const [echt] = await sql<{ n: number }[]>`
    select count(*)::int as n from valk.funfact_answers a join valk.participants p on p.id = a.participant_id where p.env = 'live'
  `;
  expect(echt.n).toBe(0);
});
