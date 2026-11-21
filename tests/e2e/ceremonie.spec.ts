/**
 * SPEC §7.5: the prize ceremony, in sync on three phones. The admin starts
 * it, every phone goes to the ceremony screen by itself, and follows each
 * tap: place 4, 3 and 2, the drumroll, the winner with the podium, and the
 * final standings with the medal table. The reveal of the winner opens the
 * lock; ending the ceremony puts the live mode back to rest.
 */
import { expect, test, type Page } from "@playwright/test";
import { db, resetState } from "./helpers";
import { binnen, check, loginBeheerder, nieuwToestel, vrijdagPunten, ZONDER_SERVICE_WORKER } from "./zeskamp-hulp";

test.use({ reducedMotion: "reduce", ...ZONDER_SERVICE_WORKER });

test.beforeEach(async () => {
  await resetState();
});

async function modus(): Promise<{ mode: string; ceremony_step: number; lock_closed: boolean }> {
  const sql = db();
  try {
    const [row] = await sql<{ mode: string; ceremony_step: number; lock_closed: boolean }[]>`
      select mode, ceremony_step, lock_closed from valk.live_state where env = 'live'
    `;
    return row;
  } finally {
    await sql.end();
  }
}

async function scoreShow(page: Page): Promise<string> {
  return ((await (await page.request.get("/api/score")).json()) as { show: string }).show;
}

test("de prijsuitreiking loopt synchroon op drie telefoons", async ({ page, browser }, info) => {
  // Three phones, seven steps and a screen check per step.
  test.setTimeout(180_000);
  await binnen(page);
  await loginBeheerder(page);
  // Avocado 10, Oranje 8, Petrol 6, Mosterd 5.
  await vrijdagPunten(page, { "Team Oranje": "8", "Team Mosterd": "5", "Team Avocado": "10", "Team Petrol": "6" });
  await page.goto("/beheer/scorebord");
  await page.getByRole("button", { name: "Zet het slot nu dicht" }).click();
  await expect(page.getByText("Het slot is dicht. De stand van nu is bewaard.")).toBeVisible();

  const een = await nieuwToestel(browser, { reducedMotion: "reduce" });
  const twee = await nieuwToestel(browser, { reducedMotion: "reduce" });
  await binnen(een.page);
  await binnen(twee.page);
  await twee.page.goto("/score");
  await expect(twee.page.getByText(/Op slot tot de prijsuitreiking/)).toBeVisible();
  // Both phones know the app is at rest before the ceremony starts.
  await een.page.waitForLoadState("networkidle");
  await twee.page.waitForLoadState("networkidle");

  // Before the ceremony the screen says what is coming.
  await een.page.goto("/ceremonie");
  await expect(een.page.getByRole("heading", { name: /De prijsuitreiking komt\seraan/ })).toBeVisible();
  await check(een.page, info, "72-ceremonie-wacht");
  await een.page.goto("/");
  await een.page.waitForLoadState("networkidle");

  await page.goto("/beheer/prijsuitreiking");
  await check(page, info, "71-beheer-prijsuitreiking");
  await page.getByRole("button", { name: "Start de prijsuitreiking" }).click();

  const telefoons = [page, een.page, twee.page];
  for (const telefoon of telefoons) {
    await expect(telefoon).toHaveURL(/\/ceremonie$/);
    await expect(telefoon.getByRole("heading", { name: /Wie wint De Valkenburger\sSpelen\?/ })).toBeVisible();
  }
  // Only the admin has the buttons; sound is on by default only on his phone.
  await expect(een.page.getByRole("button", { name: "Onthul plaats 4" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Geluid aan" })).toHaveAttribute("aria-pressed", "true");
  await expect(een.page.getByRole("button", { name: "Geluid uit" })).toHaveAttribute("aria-pressed", "false");
  await check(een.page, info, "73-ceremonie-begin");
  await check(page, info, "74-ceremonie-beheerder");

  const stap = async (knop: string, controle: (telefoon: Page) => Promise<void>) => {
    await page.getByRole("button", { name: knop }).click();
    for (const telefoon of telefoons) await controle(telefoon);
  };
  const onthuld = (telefoon: Page) => telefoon.getByRole("list", { name: "Onthulde plaatsen" });

  await stap("Onthul plaats 4", async (telefoon) => {
    await expect(onthuld(telefoon)).toContainText("Team Mosterd");
    await expect(onthuld(telefoon)).not.toContainText("Team Avocado");
  });
  expect(await scoreShow(een.page)).toBe("momentopname");
  await check(een.page, info, "75-ceremonie-plaats");

  await stap("Onthul plaats 3", async (telefoon) => {
    await expect(onthuld(telefoon)).toContainText("Team Petrol");
  });
  await stap("Onthul plaats 2", async (telefoon) => {
    await expect(onthuld(telefoon)).toContainText("Team Oranje");
    await expect(onthuld(telefoon)).not.toContainText("Team Avocado");
  });
  await stap("Tromgeroffel!", async (telefoon) => {
    await expect(telefoon.getByText(/Nog één plaats te gaan\.\sTromgeroffel!/)).toBeVisible();
  });
  expect((await modus()).lock_closed).toBe(true);
  await check(een.page, info, "76-ceremonie-trom");

  await stap("Onthul de winnaar", async (telefoon) => {
    await expect(telefoon.getByRole("heading", { name: /Team Avocado wint De Valkenburger Spelen\s2027!/ })).toBeVisible();
    await expect(telefoon.getByRole("list", { name: "Podium" })).toContainText("Team Oranje");
  });
  // The reveal opened the lock.
  expect((await modus()).lock_closed).toBe(false);
  expect(await scoreShow(een.page)).toBe("live");
  await check(een.page, info, "77-ceremonie-winnaar");

  await stap("Naar de eindstand", async (telefoon) => {
    await expect(telefoon.getByRole("heading", { name: "De eindstand" })).toBeVisible();
    await expect(telefoon.getByRole("heading", { name: /De medaillespiegel gaat naar Team\sAvocado!/ })).toBeVisible();
  });
  await check(een.page, info, "78-ceremonie-eindstand");

  await page.getByRole("button", { name: "Sluit de prijsuitreiking af" }).click();
  for (const telefoon of [een.page, twee.page]) {
    await expect(telefoon.getByText(/De prijsuitreiking is afgelopen\. Tot de volgende\sSpelen!/)).toBeVisible();
  }
  expect(await modus()).toEqual({ mode: "rust", ceremony_step: 6, lock_closed: false });

  const sql = db();
  try {
    const stappen = await sql<{ wat: string }[]>`
      select new_value->>'wat' as wat from valk.audit_log where action = 'ceremonie.stap' order by id
    `;
    expect(stappen.map((row) => row.wat)).toEqual([
      "gestart",
      "plaats 4 onthuld",
      "plaats 3 onthuld",
      "plaats 2 onthuld",
      "tromgeroffel",
      "winnaar onthuld",
      "eindstand",
      "afgesloten",
    ]);
  } finally {
    await sql.end();
  }

  await een.context.close();
  await twee.context.close();
});

test("een dubbele tik slaat geen stap over, en een stap terug kan", async ({ page }) => {
  await binnen(page);
  await loginBeheerder(page);
  await vrijdagPunten(page, { "Team Oranje": "8", "Team Mosterd": "5", "Team Avocado": "10", "Team Petrol": "6" });
  await page.goto("/beheer/prijsuitreiking");
  await page.getByRole("button", { name: "Start de prijsuitreiking" }).click();
  await expect(page).toHaveURL(/\/ceremonie$/);

  // Two taps that both saw step 0: only one counts.
  const eerste = await page.request.post("/api/ceremonie", { data: { actie: "volgende", stap: 0 } });
  const tweede = await page.request.post("/api/ceremonie", { data: { actie: "volgende", stap: 0 } });
  expect(eerste.status()).toBe(200);
  expect(tweede.status()).toBe(409);
  expect((await modus()).ceremony_step).toBe(1);

  await expect(page.getByRole("button", { name: "Een stap terug" })).toBeVisible();
  await page.getByRole("button", { name: "Een stap terug" }).click();
  await expect(page.getByRole("heading", { name: /Wie wint De Valkenburger\sSpelen\?/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop de prijsuitreiking" }).click();
  await expect.poll(async () => (await modus()).mode).toBe("rust");
  // Stopped early: the lock stays as it was, and the family is not told it is over.
  await expect(page.getByRole("heading", { name: /De prijsuitreiking komt\seraan/ })).toBeVisible();
});
