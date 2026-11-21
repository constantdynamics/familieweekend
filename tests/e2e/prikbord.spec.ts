/**
 * The prikbord: channels, posts with photos, threads, hearts and thumbs,
 * live on other phones, editing and deleting your own posts, reading along
 * without a name, the channel of the spelleiding, and moderation in beheer.
 * Screens get an accessibility check (axe), the lonely-word check and a
 * screenshot per viewport in docs/screenshots/fase-2-4/<viewport>/.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { db, losseWoorden, resetState } from "./helpers";

test.use({ reducedMotion: "reduce" });

test.beforeEach(async () => {
  await resetState();
});

/** Accessibility (axe), no lonely words, no horizontal scrolling. */
async function controleer(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, `toegankelijkheid op ${name}`).toEqual([]);
  expect(await losseWoorden(page), `losse woorden op ${name}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontaal scrollen op ${name}`).toBeLessThanOrEqual(0);
}

const schermafdruk = (info: TestInfo, name: string) =>
  `docs/screenshots/fase-2-4/${info.project.name.replace(/^(iphone|android)-/, "")}/${name}.png`;

/** The checks, plus a screenshot of the middle of a long screen. */
async function checkBij(page: Page, info: TestInfo, name: string, plek: Locator) {
  await controleer(page, name);
  await plek.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: schermafdruk(info, name) });
}

async function check(page: Page, info: TestInfo, name: string) {
  await controleer(page, name);
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
/* Test data                                                                 */
/* ------------------------------------------------------------------------ */

const FOTO = readFileSync("public/icons/icon-512.png");
const FOTO_BREED = readFileSync("public/og.png");

type Seed = { names: Record<string, string>; channels: Record<string, string>; posts: Record<string, string> };

/**
 * Names, and a board that has been used for a while. Times are relative to
 * now, so "5 minuten geleden" stays true.
 */
async function seed(): Promise<Seed> {
  const sql = db();
  try {
    const names: Record<string, string> = {};
    for (const name of ["Sanne Valkenburg", "Tim Valkenburg", "Oma Riet", "Opa Kees", "Lotte van Dijk"]) {
      const [row] = await sql<{ id: string }[]>`insert into valk.participants (env, name) values ('live', ${name}) returning id`;
      names[name] = row.id;
    }
    const channels: Record<string, string> = {};
    for (const row of await sql<{ id: string; title: string }[]>`select id, title from valk.board_channels`) {
      channels[row.title] = row.id;
    }
    const posts: Record<string, string> = {};
    const add = async (
      key: string,
      channel: string,
      author: string | null,
      body: string,
      age: string,
      extra: { parent?: string; photos?: string[] } = {},
    ) => {
      const [row] = await sql<{ id: string }[]>`
        insert into valk.board_posts (channel_id, parent_id, participant_id, author_name, author_staff, body, photo_ids, created_at)
        values (
          ${channels[channel]}, ${extra.parent ?? null}::uuid, ${author ? names[author] : null}::uuid,
          ${author ?? "De spelleiding"}, ${author === null}::boolean, ${body}, ${extra.photos ?? []}::uuid[],
          now() - ${age}::interval
        )
        returning id
      `;
      posts[key] = row.id;
    };
    const react = async (post: string, kind: "hart" | "duim", ...who: string[]) => {
      for (const name of who) {
        await sql`insert into valk.board_reactions (post_id, participant_id, kind) values (${posts[post]}, ${names[name]}, ${kind})`;
      }
    };
    const [foto] = await sql<{ id: string }[]>`
      insert into valk.uploads (kind, participant_id, mime, bytes, width, height, size_bytes, created_by)
      values ('bord', ${names["Oma Riet"]}, 'image/png', ${FOTO_BREED}, 1200, 630, ${FOTO_BREED.length}, 'Oma Riet')
      returning id
    `;

    await add(
      "welkom",
      "Mededelingen van de spelleiding",
      null,
      "Welkom op het prikbord! Hier lees je alles over het weekend.\n\nVragen? Zet ze in Vraag het de organisatie, dan ziet iedereen het antwoord.",
      "2 days",
    );
    await add(
      "taart",
      "Weet je nog?",
      "Oma Riet",
      "Weet je nog, de taart in zeven van 2019? Ik heb nog steeds spierpijn van het lachen.",
      "26 hours",
      { photos: [foto.id] },
    );
    await add("taart-1", "Weet je nog?", "Opa Kees", "Mijn stuk was het grootst, dat weet ik zeker.", "25 hours", {
      parent: posts.taart,
    });
    await add("taart-2", "Weet je nog?", "Lotte van Dijk", "Volgend jaar neem ik een liniaal mee!", "3 hours", {
      parent: posts.taart,
    });
    await add("zaklopen", "Weet je nog?", "Opa Kees", "En het zaklopen in de regen. Iedereen viel om, behalve oma.", "2 hours");
    await react("taart", "hart", "Opa Kees", "Lotte van Dijk", "Tim Valkenburg");
    await react("taart", "duim", "Opa Kees");
    await add(
      "groeten",
      "Doe de groeten aan…",
      "Lotte van Dijk",
      "Doe de groeten aan tante Ria, die er dit jaar niet bij kan zijn. We denken aan je!",
      "5 minutes",
    );
    await react("groeten", "hart", "Oma Riet", "Opa Kees");
    return { names, channels, posts };
  } finally {
    await sql.end();
  }
}

/** Another phone: its own cookies, the viewport of the project. */
async function nieuwToestel(browser: Browser) {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E.port}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: use.viewport,
    deviceScaleFactor: 2,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    reducedMotion: "reduce",
  });
  return { context, page: await context.newPage() };
}

/** Family code, then "Wie ben jij?": choose a name, or look around without one. */
async function binnen(page: Page, naam: string | null, terug = "/prikbord") {
  await page.goto(`/welkom?terug=${encodeURIComponent(terug)}`);
  // The form fills in the return path once it runs on the phone: only then type.
  await expect(page.locator('input[name="terug"]')).toHaveValue(terug);
  await page.getByLabel("Familiecode").fill(E2E.familyCode);
  await page.getByRole("button", { name: "Kom binnen" }).click();
  await expect(page).toHaveURL(/\/wie-ben-jij/);
  if (naam) {
    await page.getByRole("button", { name: naam }).click();
    await expect(page.getByText(`Gelukt! Deze telefoon hoort nu bij ${naam}.`)).toBeVisible();
    await page.getByRole("button", { name: "Klaar, naar de app" }).click();
  } else {
    await page.getByRole("link", { name: "Ik kijk eerst even rond" }).click();
  }
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === terug);
}

/** Log in as admin; under load the PIN can be typed before the page is ready, so try again. */
async function alsBeheerder(page: Page) {
  for (let poging = 1; ; poging += 1) {
    await page.goto("/beheer");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Jouw PIN").fill(E2E.adminPin);
    await page.getByRole("button", { name: "Log in" }).click();
    try {
      await expect(page.getByText(/^Ingelogd als /)).toBeVisible();
      return;
    } catch (error) {
      if (poging >= 3) throw error;
    }
  }
}

const kanaal = (seedData: Seed, title: string) => `/prikbord?kanaal=${seedData.channels[title]}`;
const bericht = (page: Page, tekst: string): Locator => page.getByRole("article").filter({ hasText: tekst }).first();
const hartje = (post: Locator) => post.getByRole("button", { name: /^Hartje/ }).first();

/* ------------------------------------------------------------------------ */

test("kanalen, een bericht met foto, live hartjes en een draadje", async ({ page, browser }, info) => {
  const data = await seed();
  // Relative times are rendered on the server first: the phone must not disagree.
  const hydratie: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) hydratie.push(message.text());
  });
  await binnen(page, "Sanne Valkenburg");

  // The channels: the pinned channel of the spelleiding first, then the order.
  await expect(page.getByRole("heading", { level: 1, name: "Prikbord" })).toBeVisible();
  await expect(page.getByText(/Je doet mee als\s+Sanne\s+Valkenburg/)).toBeVisible();
  const kanalen = page.getByRole("main").getByRole("listitem");
  await expect(kanalen.first()).toContainText("Mededelingen van de spelleiding");
  await expect(page.getByRole("link", { name: /Doe de groeten aan/ })).toContainText("1 bericht");
  await check(page, info, "40-prikbord-kanalen");

  await page.getByRole("link", { name: /Doe de groeten aan/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Doe de groeten aan…" })).toBeVisible();
  await expect(bericht(page, "tante Ria")).toContainText("5 minuten geleden");

  // Post with a photo; the photo goes up first, then the post.
  await page.getByLabel("Je bericht", { exact: true }).fill("Doe de groeten aan oom Henk in Canada. Volgend jaar ben je er weer bij!");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "valk.png", mimeType: "image/png", buffer: FOTO });
  await expect(page.getByRole("button", { name: "Haal foto 1 weg" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plaats bericht" })).toBeEnabled();
  await page.getByRole("button", { name: "Plaats bericht" }).click();
  await expect(page.getByText("Bericht geplaatst")).toBeVisible();
  const mijnBericht = bericht(page, "oom Henk");
  await expect(mijnBericht.getByRole("heading", { name: "Sanne Valkenburg" })).toBeVisible();
  await expect(mijnBericht.getByRole("button", { name: /Bekijk de foto van Sanne/ })).toBeVisible();
  await expect(page.getByLabel("Je bericht", { exact: true })).toHaveValue("");

  // Tim, on his own phone, sees it and gives a heart; Sanne sees it arrive.
  const tim = await nieuwToestel(browser);
  await binnen(tim.page, "Tim Valkenburg", kanaal(data, "Doe de groeten aan…"));
  const bijTim = bericht(tim.page, "oom Henk");
  await expect(bijTim).toBeVisible();
  await expect(bijTim.getByRole("button", { name: "Meer voor dit bericht" })).toHaveCount(0);
  await hartje(bijTim).click();
  await expect(hartje(bijTim)).toHaveAttribute("aria-pressed", "true");
  await expect(hartje(bijTim)).toHaveAccessibleName("Hartje 1");
  await expect(hartje(mijnBericht)).toHaveAccessibleName("Hartje 1", { timeout: 12_000 });

  // Tim replies; on Sanne's phone the thread shows "1 reactie" and unfolds.
  await bijTim.getByRole("button", { name: "Reageer" }).click();
  await bijTim.getByLabel("Je reactie").fill("Doe ik! Hij gaat het leuk vinden.");
  await bijTim.getByRole("button", { name: "Plaats reactie" }).click();
  await expect(tim.page.getByText("Reactie geplaatst")).toBeVisible();
  const draadje = mijnBericht.getByRole("button", { name: "1 reactie" });
  await expect(draadje).toBeVisible({ timeout: 12_000 });
  await expect(draadje).toHaveAttribute("aria-expanded", "false");
  await draadje.click();
  await expect(draadje).toHaveAttribute("aria-expanded", "true");
  await expect(mijnBericht.getByText("Hij gaat het leuk vinden.")).toBeVisible();
  await check(page, info, "41-prikbord-kanaal-draadje");

  // The photo, large.
  await mijnBericht.getByRole("button", { name: /Bekijk de foto van Sanne/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check(page, info, "42-prikbord-foto");
  await page.getByRole("button", { name: "Sluit foto" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Edit your own post.
  await mijnBericht.getByRole("button", { name: "Meer voor dit bericht" }).first().click();
  await mijnBericht.getByRole("button", { name: "Bewerk" }).click();
  await mijnBericht.getByLabel("Bewerk je bericht").fill("Doe de groeten aan oom Henk in Canada. Tot volgend jaar!");
  await check(page, info, "43-prikbord-bewerken");
  await mijnBericht.getByRole("button", { name: "Bewaar bericht" }).click();
  await expect(page.getByText("Bericht bewaard")).toBeVisible();
  await expect(bericht(page, "Tot volgend jaar!")).toContainText("bewerkt");

  // Delete it again, after a check; Tim sees it go.
  const nuMijn = bericht(page, "Tot volgend jaar!");
  await nuMijn.getByRole("button", { name: "Meer voor dit bericht" }).first().click();
  await nuMijn.getByRole("button", { name: "Verwijder" }).first().click();
  await expect(nuMijn.getByText(/De reactie eronder gaat ook\sweg/)).toBeVisible();
  await nuMijn.getByRole("button", { name: "Ja, verwijder" }).click();
  await expect(page.getByText("Bericht verwijderd")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "oom Henk" })).toHaveCount(0);
  await expect(tim.page.getByRole("article").filter({ hasText: "oom Henk" })).toHaveCount(0, { timeout: 12_000 });
  await tim.context.close();
  expect(hydratie, "hydratiefouten").toEqual([]);
});

test("populairste eerst, en zonder naam lees je alleen mee", async ({ page }, info) => {
  const data = await seed();
  await binnen(page, null);

  await expect(page.getByRole("heading", { name: "Kies je naam om mee te doen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kies je naam" })).toHaveAttribute("href", "/wie-ben-jij?terug=/prikbord");
  await check(page, info, "44-prikbord-zonder-naam");

  await page.goto(kanaal(data, "Weet je nog?"));
  await expect(page.getByRole("heading", { level: 1, name: "Weet je nog?" })).toBeVisible();
  // Newest first: the zaklopen (2 hours) before the taart (a day).
  await expect(page.getByRole("article").first()).toContainText("zaklopen");
  // No composer and no buttons for hearts, only the counts.
  await expect(page.getByLabel("Je bericht", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Hartje/ }).filter({ visible: true })).toHaveCount(0);
  await expect(bericht(page, "taart in zeven")).toContainText("3");
  await expect(page.getByRole("link", { name: "Kies je naam" })).toHaveAttribute(
    "href",
    `/wie-ben-jij?terug=${encodeURIComponent(kanaal(data, "Weet je nog?"))}`,
  );

  await page.getByRole("button", { name: "Populairste" }).click();
  await expect(page.getByRole("button", { name: "Populairste" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article").first()).toContainText("taart in zeven");
  await expect(page).toHaveURL(/sort=populair/);
  await bericht(page, "taart in zeven").getByRole("button", { name: "2 reacties" }).click();
  await expect(page.getByText("Volgend jaar neem ik een liniaal mee!")).toBeVisible();
  await check(page, info, "45-prikbord-populair");

  // A reload keeps the order.
  await page.reload();
  await expect(page.getByRole("article").first()).toContainText("taart in zeven");
});

test("de mededelingen van de spelleiding en het beheer van het prikbord", async ({ page, browser }, info) => {
  const data = await seed();
  const sanne = await nieuwToestel(browser);
  await binnen(sanne.page, "Sanne Valkenburg", kanaal(data, "Mededelingen van de spelleiding"));
  await expect(sanne.page.getByText(/Hier plaatst alleen de spelleiding\. Een hartje of duimpje geven mag\s+wel!/)).toBeVisible();
  await expect(sanne.page.getByLabel("Je bericht", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await hartje(bericht(sanne.page, "Welkom op het prikbord")).click();
  await expect(hartje(bericht(sanne.page, "Welkom op het prikbord"))).toHaveAttribute("aria-pressed", "true");
  await check(sanne.page, info, "46-prikbord-mededelingen");

  // The admin's screen.
  await binnen(page, null, "/");
  await alsBeheerder(page);
  await page.goto("/beheer/prikbord");
  await expect(page.getByRole("heading", { level: 1, name: "Prikbord" })).toBeVisible();
  await check(page, info, "47-beheer-prikbord");

  // Post as De spelleiding; Sanne sees it arrive.
  await page.getByLabel("Kanaal").selectOption({ label: "Mededelingen van de spelleiding" });
  await page.getByLabel("Je bericht", { exact: true }).fill("Het eten is klaar! Kom maar naar de grote tafel.");
  await page.getByRole("button", { name: "Plaats bericht" }).click();
  await expect(page.getByText(/Bericht geplaatst in Mededelingen van de\s+spelleiding\./)).toBeVisible();
  const mededeling = bericht(sanne.page, "Het eten is klaar!");
  await expect(mededeling).toBeVisible({ timeout: 12_000 });
  await expect(mededeling.getByRole("heading", { name: "De spelleiding" })).toBeVisible();

  // A new channel, pinned and read only: the family can only read it.
  await page.getByRole("heading", { name: "Nieuw kanaal" }).scrollIntoViewIfNeeded();
  const nieuw = page.locator("section", { has: page.getByRole("heading", { name: "Nieuw kanaal" }) }).last();
  await nieuw.getByLabel("Naam").fill("Sportclub");
  await nieuw.getByLabel("Beschrijving").fill("Trainingsschema's voor de zeskamp.");
  await nieuw.getByRole("button", { name: "Voeg kanaal toe" }).click();
  await expect(page.getByText('Kanaal "Sportclub" toegevoegd.')).toBeVisible();
  const sportclub = page.locator("details").filter({ hasText: "Sportclub" });
  await sportclub.locator("summary").click();
  await sportclub.getByLabel("Naam").fill("Sportclub Valkenburg");
  await sportclub.getByLabel("Vastzetten bovenaan").check();
  await sportclub.getByLabel("Alleen lezen").check();
  await sportclub.getByRole("button", { name: "Bewaar kanaal" }).click();
  await expect(sportclub.getByText("Kanaal bewaard.")).toBeVisible();
  await checkBij(page, info, "50-beheer-prikbord-kanaal", sportclub);

  await sanne.page.goto("/prikbord");
  const sportLink = sanne.page.getByRole("link", { name: /Sportclub Valkenburg/ });
  await expect(sportLink).toContainText("Vastgezet");
  await expect(sportLink).toContainText("Alleen lezen");
  await sportLink.click();
  await expect(sanne.page.getByText(/Dit kanaal is alleen om te\slezen\./)).toBeVisible();
  await expect(sanne.page.getByLabel("Je bericht", { exact: true }).filter({ visible: true })).toHaveCount(0);

  // Hide a post: the family no longer sees it; show it again.
  await sanne.page.goto(kanaal(data, "Doe de groeten aan…"));
  await expect(bericht(sanne.page, "tante Ria")).toBeVisible();
  await page.goto("/beheer/prikbord#berichten");
  const teModereren = page.getByRole("listitem").filter({ hasText: "tante Ria" });
  await teModereren.getByRole("button", { name: "Verberg" }).click();
  await expect(teModereren.getByText("Verborgen", { exact: true })).toBeVisible();
  await expect(sanne.page.getByRole("article").filter({ hasText: "tante Ria" })).toHaveCount(0, { timeout: 12_000 });
  await page.goto("/beheer/prikbord?toon=verborgen#berichten");
  await expect(page.getByRole("listitem").filter({ hasText: "tante Ria" })).toBeVisible();
  await check(page, info, "48-beheer-prikbord-verborgen");
  await page.getByRole("listitem").filter({ hasText: "tante Ria" }).getByRole("button", { name: "Laat weer zien" }).click();
  await expect(page.getByText("Er zijn geen verborgen berichten.")).toBeVisible();
  await expect(bericht(sanne.page, "tante Ria")).toBeVisible({ timeout: 12_000 });

  // Edit and delete someone else's post.
  await page.goto("/beheer/prikbord#berichten");
  const zaklopen = page.getByRole("listitem").filter({ hasText: "zaklopen in de regen" });
  await zaklopen.getByRole("button", { name: "Bewerk" }).click();
  await zaklopen.getByLabel("Bewerk het bericht").fill("En het zaklopen in de regen. Iedereen viel om!");
  await zaklopen.getByRole("button", { name: "Bewaar bericht" }).click();
  const bewerkt = page.getByRole("listitem").filter({ hasText: "Iedereen viel om!" });
  await expect(bewerkt).toContainText("bewerkt door de spelleiding");
  await bewerkt.getByRole("button", { name: "Verwijder" }).click();
  await bewerkt.getByRole("button", { name: "Ja, verwijder" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Iedereen viel om!" })).toHaveCount(0);

  // Everything is in the logbook.
  await page.goto("/beheer/logboek");
  for (const label of [
    "Prikbord: bericht van de spelleiding",
    "Prikbord: kanaal toegevoegd",
    "Prikbord: kanaal gewijzigd",
    "Prikbord: bericht verborgen",
    "Prikbord: bericht weer zichtbaar",
    "Prikbord: bericht gewijzigd",
    "Prikbord: bericht verwijderd",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // Close the board: the family only reads; open it again.
  await page.goto("/beheer/prikbord");
  await page.getByRole("switch", { name: "Prikbord open" }).click();
  await expect(page.getByRole("switch", { name: "Prikbord open" })).toHaveAttribute("aria-checked", "false");
  await sanne.page.goto(kanaal(data, "Weet je nog?"));
  await expect(sanne.page.getByText(/Het prikbord is even dicht\. Lezen kan\swel\./)).toBeVisible();
  await expect(sanne.page.getByLabel("Je bericht", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await check(sanne.page, info, "49-prikbord-dicht");
  await page.getByRole("switch", { name: "Prikbord open" }).click();
  await expect(page.getByRole("switch", { name: "Prikbord open" })).toHaveAttribute("aria-checked", "true");
  await sanne.context.close();
});

test("een telefoon met twee namen kiest Plaats als, en hartjes horen bij die naam", async ({ page }, info) => {
  const data = await seed();
  await page.goto(`/welkom?terug=${encodeURIComponent(kanaal(data, "Weet je nog?"))}`);
  await page.getByLabel("Familiecode").fill(E2E.familyCode);
  await page.getByRole("button", { name: "Kom binnen" }).click();
  await page.getByRole("button", { name: "Sanne Valkenburg" }).click();
  await expect(page.getByText("Gelukt! Deze telefoon hoort nu bij Sanne Valkenburg.")).toBeVisible();
  await page.getByRole("button", { name: "Tim Valkenburg" }).click();
  await expect(page.getByRole("heading", { name: "Op deze telefoon zijn" })).toBeVisible();
  await page.getByRole("button", { name: "Klaar, naar de app" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weet je nog?" })).toBeVisible();

  const plaatsAls = page.getByLabel("Plaats als");
  await expect(plaatsAls).toHaveValue(data.names["Sanne Valkenburg"]);
  // Tim gave the taart a heart already (seed); Sanne did not.
  const taart = bericht(page, "taart in zeven");
  await expect(hartje(taart)).toHaveAttribute("aria-pressed", "false");
  await plaatsAls.selectOption({ label: "Tim Valkenburg" });
  await expect(hartje(taart)).toHaveAttribute("aria-pressed", "true");
  await expect(hartje(taart)).toHaveAccessibleName("Hartje 3");

  await page.getByLabel("Je bericht", { exact: true }).fill("Ik weet het nog goed: de slagroom zat tot aan het plafond.");
  await check(page, info, "51-prikbord-plaats-als");
  await page.getByRole("button", { name: "Plaats bericht" }).click();
  await expect(page.getByText("Bericht geplaatst")).toBeVisible();
  await expect(bericht(page, "slagroom").getByRole("heading", { name: "Tim Valkenburg" })).toBeVisible();

  // Sanne gives her own heart; the counts add up, one per name.
  await plaatsAls.selectOption({ label: "Sanne Valkenburg" });
  await hartje(taart).click();
  await expect(hartje(taart)).toHaveAttribute("aria-pressed", "true");
  await expect(hartje(taart)).toHaveAccessibleName("Hartje 4");
  await page.reload();
  await expect(hartje(bericht(page, "taart in zeven"))).toHaveAccessibleName("Hartje 4");
});

test("tekst blijft tekst, links zijn veilig en de floodlimiet houdt spam tegen", async ({ page }) => {
  const data = await seed();
  await binnen(page, "Tim Valkenburg", kanaal(data, "Opscheppen mag"));
  await page.evaluate(() => {
    (window as unknown as { __xss?: number }).__xss = 0;
  });
  await page
    .getByLabel("Je bericht", { exact: true })
    .fill('<script>window.__xss = 1</script><img src=x onerror="window.__xss = 2"> Mijn schema: https://example.com/zeskamp.');
  await page.getByRole("button", { name: "Plaats bericht" }).click();
  const post = bericht(page, "Mijn schema");
  await expect(post).toContainText("<script>window.__xss = 1</script>");
  await expect(post.locator("img")).toHaveCount(0);
  const link = post.getByRole("link", { name: /example\.com\/zeskamp/ });
  await expect(link).toHaveAttribute("href", "https://example.com/zeskamp");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(0);

  // Ten posts in a few minutes is enough.
  const sql = db();
  try {
    await sql`
      insert into valk.board_posts (channel_id, participant_id, author_name, body, created_at)
      select ${data.channels["Opscheppen mag"]}, ${data.names["Tim Valkenburg"]}, 'Tim Valkenburg', 'Bericht ' || n, now() - make_interval(secs => n * 5)
      from generate_series(1, 9) as n
    `;
  } finally {
    await sql.end();
  }
  await page.getByLabel("Je bericht", { exact: true }).fill("Nog eentje dan");
  await page.getByRole("button", { name: "Plaats bericht" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Rustig aan! Je hebt net al 10 berichten geplaatst\./ })).toBeVisible();
  await expect(page.getByLabel("Je bericht", { exact: true })).toHaveValue("Nog eentje dan");
});

test("de familie ziet het prikbord pas als het live is; in de proef lees je mee", async ({ page, browser }) => {
  const data = await seed();
  const sanne = await nieuwToestel(browser);
  await binnen(sanne.page, "Sanne Valkenburg");
  await binnen(page, null, "/");
  await alsBeheerder(page);

  const sql = db();
  try {
    await sql`update valk.settings set fase2_live = false where id = 1`;
  } finally {
    await sql.end();
  }
  const keepalive = await fetch(`http://localhost:${E2E.port}/api/keepalive`, {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  expect(keepalive.ok).toBe(true);

  await sanne.page.goto("/prikbord");
  await expect(sanne.page.getByRole("heading", { name: "Het prikbord komt eraan" })).toBeVisible();
  expect((await sanne.page.request.get("/api/prikbord")).status()).toBe(404);
  expect((await sanne.page.request.get(`/api/prikbord/${data.channels["Weet je nog?"]}`)).status()).toBe(404);
  await sanne.context.close();

  // The admin can already try it out, also in the test environment, where
  // nobody posts with a name (the board is real).
  await page.goto(kanaal(data, "Weet je nog?"));
  await expect(page.getByRole("heading", { level: 1, name: "Weet je nog?" })).toBeVisible();
  await page.goto("/beheer/proef");
  await page.getByRole("button", { name: "Zet de proef klaar" }).click();
  await page.getByRole("button", { name: "Ga de proef in op deze telefoon" }).click();
  await expect(page.getByText("Je zit in de proef", { exact: true })).toBeVisible();
  await page.goto(kanaal(data, "Weet je nog?"));
  await expect(page.getByText(/Je zit in de proef\. Het prikbord is echt, dus hier lees je alleen\s+mee\./)).toBeVisible();
  // As the spelleiding the admin can still post.
  await expect(page.getByText(/Je plaatst als De\sspelleiding\./)).toBeVisible();
});
