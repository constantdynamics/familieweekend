/**
 * Programma, Thuis tijdens en na het weekend, het weer en de teams
 * (SPEC §4.1, §4.3, §4.4 en §4.10). The phone's clock decides what is "now",
 * so the weekend screens are tested with Playwright's clock. The weather is
 * the fixture of Open-Meteo, served to the phone (the server cannot reach
 * Open-Meteo here, and its own clock says it is still too early).
 *
 * Every screen: axe (WCAG 2.2 AA), no lonely words, no horizontal scroll, and
 * screenshots in docs/screenshots/fase-2-4/<viewport>/.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type postgres from "postgres";
import { E2E } from "../../playwright.config";
import { parseOpenMeteo } from "../../src/lib/server/open-meteo";
import { forWeekend, type WeatherReport } from "../../src/lib/shared/weather";
import { db, loggedIn, loginAdmin, losseWoorden, resetState } from "./helpers";

// No service worker: it would hide the phone's requests from page.route.
test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

test.beforeEach(async () => {
  await resetState();
});

const START = "2027-05-06T12:00:00.000Z";
const END = "2027-05-09T13:00:00.000Z";
const ZATERDAG = new Date("2027-05-08T11:42:00+02:00");
const DONDERDAGAVOND = new Date("2027-05-06T20:10:00+02:00");
const NA_HET_WEEKEND = new Date("2027-05-10T10:00:00+02:00");

/* ------------------------------------------------------------------------ */

async function metDatabase<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = db();
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/** Change settings straight in the database, then let the app drop its cached copy. */
async function instellingen(patch: { program_visible?: boolean; teams_visible?: boolean; fase2_live?: boolean }) {
  await metDatabase((sql) => sql`update valk.settings set ${sql(patch)} where id = 1`);
  const response = await fetch(`http://localhost:${E2E.port}/api/keepalive`, {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  expect(response.ok).toBe(true);
}

/** Change the live state and ring: phones poll the version and fetch again. */
async function liveStand(patch: { mode?: string; lock_closed?: boolean; games_started_at?: Date | null }) {
  await metDatabase((sql) => sql`update valk.live_state set ${sql(patch)}, version = version + 1 where env = 'live'`);
}

/** Places and notes as in the design reference (the seeded program has none). */
async function plekken() {
  await metDatabase(async (sql) => {
    await sql`update valk.program_items set location = 'Op het grasveld' where title = 'Zeskamp, spel 1 t/m 3'`;
    await sql`update valk.program_items set subtitle = 'Neem droge sokken mee' where title = 'Zeskamp, spel 4 t/m 6'`;
    await sql`
      update valk.program_items set location = 'In de grote tent'
      where starts_at::date = '2027-05-08' and title in ('Ontbijt', 'Lunch')
    `;
  });
}

/** Four teams with names, captains and two jokers already played. */
async function deelnemers() {
  await metDatabase(async (sql) => {
    const teams = Object.fromEntries(
      (await sql<{ id: string; name: string }[]>`select id, name from valk.teams where env = 'live'`).map((t) => [t.name, t.id]),
    );
    const rows = [
      ["Sanne Valkenburg", "Sanne", "Team Mosterd", true],
      ["Tim Valkenburg", "Tim", "Team Mosterd", false],
      ["Oma Riet", null, "Team Mosterd", false],
      ["Bram de Vries", "Bram", "Team Oranje", true],
      ["Noor de Vries", null, "Team Oranje", false],
      ["Fien Jansen", null, "Team Avocado", true],
      ["Kees Bakker", null, "Team Petrol", true],
      ["Lotte Smit", null, "Team Petrol", false],
    ] as const;
    for (const [name, nickname, team, captain] of rows) {
      await sql`
        insert into valk.participants (env, name, nickname, team_id, is_captain)
        values ('live', ${name}, ${nickname}, ${teams[team]}, ${captain})
      `;
    }
    await sql`insert into valk.jokers (env, team_id, kind, round_no, set_by) values ('live', ${teams["Team Mosterd"]}, 'quiz', 4, 'Sanne')`;
    await sql`
      insert into valk.jokers (env, team_id, kind, event_id, set_by)
      select 'live', ${teams["Team Petrol"]}, 'zeskamp', id, 'Kees' from valk.events where env = 'live' and name = 'Skilopen'
    `;
    await sql`update valk.events set status = 'klaar' where env = 'live' and kind = 'quiz'`;
  });
}

/** The weather of the fixture, as /api/weer gives it, fetched at 11:30. */
function weerRapport(): WeatherReport {
  const answer: unknown = JSON.parse(readFileSync("tests/fixtures/open-meteo-weekend.json", "utf8"));
  const forecast = forWeekend(parseOpenMeteo(answer)!, START, END);
  return {
    status: "ok",
    announceDate: "2027-04-22",
    place: "Borkel en Schaft",
    fetchedAt: "2027-05-08T09:30:00.000Z",
    ...forecast,
  };
}

async function metWeer(page: Page) {
  await page.route("**/api/weer", (route) => route.fulfill({ json: weerRapport() }));
}

/** A second phone with the same screen size as this project. */
async function tweedeToestel(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const use = info.project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    locale: use.locale,
    timezoneId: use.timezoneId,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
}

/**
 * A form field by its label. Next keeps the previous page mounted but hidden
 * after a client navigation, so only the visible one counts.
 */
function veld(page: Page, label: string) {
  return page.getByLabel(label, { exact: true }).filter({ visible: true });
}

async function kiesNaam(page: Page, naam: RegExp) {
  await page.goto("/wie-ben-jij");
  await page.getByRole("button", { name: naam }).click();
  await expect(page.getByText(/Gelukt! Deze telefoon hoort nu bij/)).toBeVisible();
}

async function check(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  // For contrast problems: the colours axe saw and what it took as the background.
  const problems = results.violations.map((v) => {
    const nodes = v.nodes.map((n) => {
      const data = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      const behind = n.any[0]?.relatedNodes?.map((r) => r.target.join(" ")).join(" + ");
      return data?.fgColor ? `${n.target.join(" ")} (${data.fgColor} op ${data.bgColor} = ${data.contrastRatio}, achter: ${behind})` : n.target.join(" ");
    });
    return `${v.id}: ${nodes.join(", ")}`;
  });
  if (problems.length > 0) {
    const tabs = await page.getByRole("tab").evaluateAll((elements) =>
      elements.map((el) => `${el.id} ${el.getAttribute("aria-selected")} ${getComputedStyle(el).color} op ${getComputedStyle(el).backgroundColor}`),
    );
    console.log(`Tabs op ${name} na axe: ${tabs.join(" | ") || "geen"}`);
  }
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

/* ------------------------------------------------------------------------ */

test("het programma blijft verborgen tot de beheerder het vrijgeeft, en komt dan live binnen", async ({ page, browser }, info) => {
  await loggedIn(page);
  await page.goto("/programma");
  await expect(page.getByRole("heading", { name: "Het programma volgt" })).toBeVisible();
  await check(page, info, "50-programma-verborgen");

  const admin = await tweedeToestel(browser, info);
  const beheer = await admin.newPage();
  await loggedIn(beheer);
  await loginAdmin(beheer);
  await beheer.goto("/beheer/programma");
  const schakelaar = beheer.getByRole("switch", { name: "Programma zichtbaar voor de familie" });
  await expect(schakelaar).toHaveAttribute("aria-checked", "false");
  await expect(beheer.getByRole("heading", { level: 2, name: /Zaterdag 8\smei/ })).toBeVisible();
  await check(beheer, info, "51-beheer-programma");
  await schakelaar.click();
  await expect(schakelaar).toHaveAttribute("aria-checked", "true");

  // The family's phone follows without reloading.
  const dagen = page.getByRole("tablist", { name: "Kies een dag" });
  await expect(dagen).toBeVisible({ timeout: 15_000 });
  await expect(dagen.getByRole("tab")).toHaveText([/Do\s*6\smei/, /Vr\s*7\smei/, /Za\s*8\smei/, /Zo\s*9\smei/]);
  // In November no day of the weekend is today: the first day opens.
  await expect(dagen.getByRole("tab", { name: /Do/ })).toHaveAttribute("aria-selected", "true");
  const paneel = page.getByRole("tabpanel");
  await expect(paneel.getByText("Aankomst en kamers verdelen")).toBeVisible();
  // The server's clock says November: no forecast yet.
  await expect(paneel.getByText(/Het weerbericht verschijnt rond 22\sapril\./)).toBeVisible();
  const weer = await page.request.get("/api/weer");
  expect(await weer.json()).toMatchObject({ status: "later", announceDate: "2027-04-22", days: [] });
  await check(page, info, "52-programma");

  await admin.close();
});

test("tijdens het weekend opent vandaag, met Nu, gedimde onderdelen en links naar quiz en zeskamp", async ({ page }, info) => {
  await instellingen({ program_visible: true });
  await plekken();
  await page.clock.setFixedTime(ZATERDAG);
  await metWeer(page);
  await loggedIn(page);
  await page.goto("/programma");

  const dagen = page.getByRole("tablist", { name: "Kies een dag" });
  await expect(dagen.getByRole("tab", { name: /Za/ })).toHaveAttribute("aria-selected", "true");
  const paneel = page.getByRole("tabpanel");
  const nu = paneel.getByRole("listitem").filter({ hasText: "Zeskamp, spel 1 t/m 3" });
  await expect(nu.getByText("Nu", { exact: true })).toBeVisible();
  await expect(nu).toContainText(/Op het grasveld · Het scorebord gaat op\sslot/);
  await expect(paneel.getByRole("listitem").filter({ hasText: "Ontbijt" })).toHaveCSS("opacity", "0.7");
  await expect(paneel.getByRole("listitem").filter({ hasText: "Lunch" })).toHaveCSS("opacity", "1");
  await expect(paneel.getByText(/Licht bewolkt, 10 tot 19°, 10% kans op\sregen/)).toBeVisible();
  await check(page, info, "53-programma-zaterdag");

  // With reduced motion nothing transitions: a colour must not lag behind a click (axe saw that in CI).
  await expect(dagen.getByRole("tab", { name: /Zo/ })).toHaveCSS("transition-duration", "0s");
  // Moederdag on Sunday: the flower and its own colour.
  await dagen.getByRole("tab", { name: /Zo/ }).click();
  const moederdag = paneel.getByRole("listitem").filter({ hasText: "Moederdagontbijt" });
  await expect(moederdag.locator("svg")).toHaveCount(1);
  await expect(moederdag).toHaveCSS("background-color", "rgb(59, 36, 23)");
  await check(page, info, "54-programma-zondag");

  // Arrow keys move between the days.
  await dagen.getByRole("tab", { name: /Zo/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dagen.getByRole("tab", { name: /Za/ })).toHaveAttribute("aria-selected", "true");
  await expect(dagen.getByRole("tab", { name: /Za/ })).toBeFocused();

  await paneel.getByRole("link", { name: /Zeskamp, spel 4 t\/m\s6/ }).click();
  await expect(page).toHaveURL(/\/zeskamp$/);
  await page.goBack();
  await page.getByRole("tab", { name: /Do/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: /De Grote Valkenburger\sQuiz/ }).click();
  await expect(page).toHaveURL(/\/quiz$/);
});

test("de beheerder voegt toe, wijzigt, zet op volgorde en verwijdert; de familie ziet het meteen", async ({ page, browser }, info) => {
  await instellingen({ program_visible: true });
  await loggedIn(page);
  await page.goto("/programma");
  await page.getByRole("tab", { name: /Za/ }).click();
  const paneel = page.getByRole("tabpanel");

  const admin = await tweedeToestel(browser, info);
  const beheer = await admin.newPage();
  await loggedIn(beheer);
  await loginAdmin(beheer);
  await beheer.goto("/beheer/programma");

  // A field left empty says what to do.
  await veld(beheer, "Begin").fill("21:30");
  await beheer.getByRole("button", { name: "Voeg onderdeel toe" }).click();
  await expect(beheer.getByText("Geef het onderdeel een titel.")).toBeVisible();

  async function voegToe(titel: string, plek: string) {
    await veld(beheer, "Dag").selectOption("2027-05-08");
    await veld(beheer, "Begin").fill("21:30");
    await veld(beheer, "Eind").fill("23:00");
    await veld(beheer, "Titel").fill(titel);
    await veld(beheer, "Plek").fill(plek);
    await beheer.getByRole("button", { name: "Voeg onderdeel toe" }).click();
    await expect(beheer.getByText(`Onderdeel toegevoegd: ${titel}.`)).toBeVisible();
  }
  await voegToe("Kampvuur", "Bij de vijver");
  const zaterdag = beheer.locator("#dag-2027-05-08");
  await expect(zaterdag.getByRole("link", { name: /Kampvuur/ })).toBeVisible();

  // Live at the family, with the end time and the place.
  const kampvuur = paneel.getByRole("listitem").filter({ hasText: "Kampvuur" });
  await expect(kampvuur).toBeVisible({ timeout: 15_000 });
  await expect(kampvuur).toContainText("tot 23:00");
  await expect(kampvuur).toContainText("Bij de vijver");

  // Two items at the same time: the arrows decide the order.
  await voegToe("Sterren kijken", "Op de heide");
  await expect(zaterdag.getByRole("button", { name: "Zet Kampvuur een plek omhoog" })).toBeDisabled();
  await zaterdag.getByRole("button", { name: "Zet Sterren kijken een plek omhoog" }).click();
  await expect(zaterdag.getByRole("button", { name: "Zet Sterren kijken een plek omhoog" })).toBeDisabled();
  await expect(paneel.getByRole("listitem").filter({ hasText: /21:30/ })).toHaveText([/Sterren\skijken/, /Kampvuur/], {
    timeout: 15_000,
  });

  // Change an item.
  await zaterdag.getByRole("link", { name: /Kampvuur/ }).click();
  await expect(beheer.getByRole("heading", { level: 1, name: "Onderdeel wijzigen" })).toBeVisible();
  await expect(veld(beheer, "Titel")).toHaveValue("Kampvuur");
  await expect(veld(beheer, "Eind")).toHaveValue("23:00");
  await check(beheer, info, "55-beheer-onderdeel");
  await veld(beheer, "Titel").fill("Kampvuur met marshmallows");
  await veld(beheer, "Soort").selectOption("moederdag");
  await beheer.getByRole("button", { name: "Bewaar onderdeel" }).click();
  await expect(beheer.getByText("Onderdeel bewaard. Iedereen ziet het meteen.")).toBeVisible();
  await expect(paneel.getByText(/Kampvuur met\smarshmallows/)).toBeVisible({ timeout: 15_000 });

  // Delete, after a second tap.
  await beheer.locator("#dag-2027-05-08").getByRole("link", { name: /Sterren\skijken/ }).click();
  await beheer.getByRole("button", { name: "Verwijder onderdeel" }).click();
  await beheer.getByRole("button", { name: "Ja, verwijder onderdeel" }).click();
  await expect(beheer.getByText("Onderdeel verwijderd.")).toBeVisible();
  await expect(beheer.locator("#dag-2027-05-08").getByRole("link", { name: /Sterren\skijken/ })).toHaveCount(0);
  await expect(paneel.getByText("Sterren kijken")).toHaveCount(0, { timeout: 15_000 });

  // Everything is in the logbook.
  const acties = await metDatabase((sql) => sql<{ action: string; n: number }[]>`
    select action, count(*)::int as n from valk.audit_log where action like 'programma.%' group by action order by action
  `);
  expect(acties).toEqual([
    { action: "programma.gewijzigd", n: 2 },
    { action: "programma.toegevoegd", n: 2 },
    { action: "programma.verwijderd", n: 1 },
  ]);
  await admin.close();
});

test("Thuis tijdens het weekend: nu bezig, straks, de tegels, het weer, je team en het slot", async ({ page }, info) => {
  await instellingen({ program_visible: true, teams_visible: true });
  await plekken();
  await liveStand({ games_started_at: new Date("2027-05-06T18:00:00Z"), lock_closed: true });
  await page.clock.setFixedTime(ZATERDAG);
  await metWeer(page);
  await loggedIn(page);
  await deelnemers();
  await kiesNaam(page, /Tim Valkenburg/);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /De Valkenburger Spelen, Zaterdag 8\smei/ })).toBeVisible();
  await expect(page.getByText(/^Dag 3 van de Spelen, het is\s11:42$/)).toBeVisible();

  const nu = page.getByRole("region", { name: /Zeskamp, spel 1 t\/m\s3/ });
  await expect(nu.getByText("Nu bezig")).toBeVisible();
  await expect(nu.getByText(/Op het grasveld, nog 48\sminuten/)).toBeVisible();

  const straks = page.getByRole("region", { name: "Straks" });
  await expect(straks.getByRole("listitem")).toHaveText([/12:30\s*Lunch\s*In de grote\stent/, /14:00\s*Zeskamp, spel 4 t\/m\s6/]);

  const tegels = page.getByRole("navigation", { name: "Vandaag in de app" });
  await expect(tegels.getByRole("link")).toHaveText([/Zeskamp\s*Nu\sbezig/, /Score\s*Op\sslot/]);

  const weer = page.getByRole("region", { name: "Het weer in Borkel en Schaft" });
  await expect(weer.getByText(/^Nu 19°$/)).toBeVisible();
  await expect(weer.getByText(/Licht bewolkt, 10% kans op\sregen/)).toBeVisible();
  await expect(weer.getByRole("list").first().getByRole("listitem")).toHaveCount(5);
  await expect(weer.getByText(/Bijgewerkt om\s11:30\./)).toBeVisible();

  const team = page.getByRole("region", { name: /Jij speelt bij Team\sMosterd/ });
  await expect(team.getByText(/Captain Sanne heeft de joker nog voor de\szeskamp/)).toBeVisible();
  await expect(page.getByText(/Het scorebord is op slot tot de prijsuitreiking, vanavond om\s20:30\./)).toBeVisible();
  await check(page, info, "60-thuis-tijdens");

  // The team screen, from the team card.
  await team.getByRole("link", { name: "Bekijk alle teams" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  const mosterd = page.getByRole("region", { name: /Team\sMosterd\s*, jouw team/ });
  await expect(mosterd.getByText(/Captain:\s*Sanne/)).toBeVisible();
  await expect(mosterd.getByText(/Quizjoker: ingezet in ronde\s4/)).toBeVisible();
  await expect(mosterd.getByText(/Zeskampjoker: nog te\sspelen/)).toBeVisible();
  await expect(mosterd.getByRole("listitem").filter({ hasText: "Tim" })).toContainText("dat ben jij");
  const petrol = page.getByRole("region", { name: /Team\sPetrol/ });
  await expect(petrol.getByText(/Zeskampjoker: ingezet bij\sSkilopen/)).toBeVisible();
  await expect(petrol.getByText(/Quizjoker: niet\sgebruikt/)).toBeVisible();
  await check(page, info, "64-teams");
});

test("Thuis op donderdagavond: de quiz loopt, met banner en quiztegel", async ({ page }, info) => {
  await instellingen({ program_visible: true });
  // Already running when the phone opens the app: no jump to the quiz screen.
  await liveStand({ mode: "quiz", games_started_at: new Date("2027-05-06T18:00:00Z") });
  await page.clock.setFixedTime(DONDERDAGAVOND);
  await metWeer(page);
  await loggedIn(page);

  await expect(page.getByText(/^Het is zover! Dag 1 van de Spelen, het is\s20:10$/)).toBeVisible();
  const banner = page.getByRole("link", { name: /De quiz is\sbegonnen\s*Kijk mee, je team heeft je\snodig/ });
  await expect(banner).toHaveAttribute("href", "/quiz");
  const nu = page.getByRole("region", { name: /De Grote Valkenburger\sQuiz/ });
  await expect(nu.getByText(/^Nog 2 uur en 20\sminuten$/)).toBeVisible();
  const tegels = page.getByRole("navigation", { name: "Vandaag in de app" });
  await expect(tegels.getByRole("link")).toHaveText([/Quiz\s*Nu bezig, kijk\smee/, /Score\s*De stand van de\sSpelen/]);
  await check(page, info, "61-thuis-quizavond");

  // When the quiz ends, the banner goes; the quiz tile stays for the evening.
  await liveStand({ mode: "rust" });
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  await expect(tegels.getByRole("link", { name: /Quiz/ })).toBeVisible();
});

test("Thuis 's nachts: even niets op het programma", async ({ page }) => {
  await instellingen({ program_visible: true });
  await page.clock.setFixedTime(new Date("2027-05-07T02:15:00+02:00"));
  await metWeer(page);
  await loggedIn(page);
  await expect(page.getByRole("heading", { name: "Even niets op het programma" })).toBeVisible();
  await expect(page.getByText(/Slaap lekker! Straks gaan we\sverder\./)).toBeVisible();
  await expect(page.getByRole("region", { name: "Straks" }).getByRole("listitem").first()).toContainText(/09:30\s*Ontbijt/);
});

test("Thuis na het weekend: tot de volgende Spelen", async ({ page }, info) => {
  await page.clock.setFixedTime(NA_HET_WEEKEND);
  await loggedIn(page);
  await expect(page.getByRole("heading", { name: "Tot de volgende Spelen!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bekijk de eindstand" })).toHaveAttribute("href", "/score");
  await check(page, info, "62-thuis-na");
});

test("zonder de nieuwe app blijft Thuis zoals hij was, ook tijdens het weekend; de beheerder ziet het al", async ({ page, browser }, info) => {
  await instellingen({ fase2_live: false, program_visible: true });
  await page.clock.setFixedTime(ZATERDAG);
  await metWeer(page);
  // The phone asks /api/thuis (it cannot know who is the admin) and must stay the old Thuis.
  const thuisGevraagd = page.waitForResponse((response) => response.url().endsWith("/api/thuis"));
  await loggedIn(page);
  await thuisGevraagd;
  await expect(page.getByText("Het is zover!")).toBeVisible();
  await expect(page.getByText("Nu bezig")).toHaveCount(0);
  await page.goto("/programma");
  await expect(page.getByRole("heading", { name: "Het programma volgt" })).toBeVisible();

  const admin = await tweedeToestel(browser, info);
  const beheer = await admin.newPage();
  await beheer.clock.setFixedTime(ZATERDAG);
  await beheer.route("**/api/weer", (route) => route.fulfill({ json: weerRapport() }));
  await loggedIn(beheer);
  await loginAdmin(beheer);
  await beheer.goto("/");
  await expect(beheer.getByRole("region", { name: /Zeskamp, spel 1 t\/m\s3/ })).toBeVisible();
  await beheer.goto("/programma");
  await expect(beheer.getByText(/Alleen jij ziet het programma nu\./)).toBeVisible();
  await admin.close();
});

test("de teams blijven geheim tot de beheerder ze zichtbaar maakt", async ({ page }, info) => {
  await loggedIn(page);
  await deelnemers();
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "De teams zijn nog geheim" })).toBeVisible();
  await check(page, info, "63-teams-geheim");
  const api = await page.request.get("/api/teams");
  expect(await api.json()).toMatchObject({ toon: false, teams: [] });

  await instellingen({ teams_visible: true });
  await page.reload();
  await expect(page.getByRole("region", { name: /Team\sOranje/ }).getByText(/Captain:\s*Bram/)).toBeVisible();
  await expect(page.getByRole("region", { name: /Team\sPetrol/ }).getByRole("listitem").filter({ hasText: /Lotte/ })).toBeVisible();
});

test("zonder verbinding toont Thuis het laatst bekende weer en programma, met de tijd", async ({ page }) => {
  await instellingen({ program_visible: true });
  await page.clock.setFixedTime(ZATERDAG);
  await metWeer(page);
  await loggedIn(page);
  const weer = page.getByRole("region", { name: "Het weer in Borkel en Schaft" });
  await expect(weer.getByText(/^Nu 19°$/)).toBeVisible();
  await expect(page.getByRole("region", { name: /Zeskamp, spel 1 t\/m\s3/ })).toBeVisible();

  await page.unroute("**/api/weer");
  await page.route("**/api/weer", (route) => route.abort("internetdisconnected"));
  await page.route("**/api/thuis", (route) => route.abort("internetdisconnected"));
  await page.reload();
  await expect(weer.getByText(/^Nu 19°$/)).toBeVisible();
  await expect(weer.getByText(/Geen verbinding, laatst bijgewerkt om\s11:30\./)).toBeVisible();
  await expect(page.getByRole("region", { name: /Zeskamp, spel 1 t\/m\s3/ })).toBeVisible();
});
