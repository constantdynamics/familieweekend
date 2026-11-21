/**
 * The lock (SPEC §4.5 "Slot" and §5.3): it closes at the start of the first
 * zeskamp game with a snapshot. While it is closed, no public API gives a
 * point scored after the lock: not to the family, not to captains and not
 * to spelleiders (except the places of their own game). The admin sees
 * everything, unless he wants to be surprised too.
 */
import { expect, test, type Page } from "@playwright/test";
import { db, resetState } from "./helpers";
import {
  binnen,
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

test.use(ZONDER_SERVICE_WORKER);

test.beforeEach(async () => {
  await resetState();
});

async function teamIds(): Promise<Record<string, string>> {
  const sql = db();
  try {
    const rows = await sql<{ id: string; name: string }[]>`select id, name from valk.teams where env = 'live'`;
    return Object.fromEntries(rows.map((row) => [row.name, row.id]));
  } finally {
    await sql.end();
  }
}

type Stand = { team: { name: string }; twelfths: number | null; breakdown: { kind: string }[] };

async function score(page: Page) {
  const response = await page.request.get("/api/score");
  expect(response.status()).toBe(200);
  return (await response.json()) as { show: string; standings: Stand[]; parts: { name: string; status: string; played: boolean }[]; jokers: { label: string; team: { name: string } }[] };
}

const totalen = (standings: Stand[]) => standings.map((row) => [row.team.name, row.twelfths]);

test("tijdens het slot lekt geen enkele API punten van na het slot", async ({ page, browser }) => {
  await binnen(page);
  await loginBeheerder(page);

  // Before the lock: vrijdag points and a bonus.
  await vrijdagPunten(page, { "Team Oranje": "8", "Team Mosterd": "5", "Team Avocado": "10", "Team Petrol": "6" });
  await page.goto("/beheer/scorebord#punten");
  await page.getByLabel("Team", { exact: true }).selectOption({ label: "Team Avocado" });
  await page.getByLabel("Punten", { exact: true }).fill("2");
  await page.getByLabel("Reden", { exact: true }).fill("Mooiste teamyel");
  await page.getByRole("button", { name: "Bewaar de punten" }).click();
  await expect(page.getByText("Punten gegeven aan Team Avocado.")).toBeVisible();

  const kees = await maakSpelleider(page, "Kees");
  const ans = await maakSpelleider(page, "Ans");
  const captainPin = await maakTeamPin(page, "Team Petrol");

  const familie = await nieuwToestel(browser);
  await binnen(familie.page);
  const voor = await score(familie.page);
  expect(voor.show).toBe("live");
  const STAND_VOOR = [
    ["Team Avocado", 144],
    ["Team Oranje", 96],
    ["Team Petrol", 72],
    ["Team Mosterd", 60],
  ];
  expect(totalen(voor.standings)).toEqual(STAND_VOOR);

  // The captain of Team Petrol puts the joker on game 1, before the start.
  const captain = await nieuwToestel(browser);
  await loginCaptain(captain.page, captainPin);
  await captain.page.goto("/zeskamp");
  const taart = captain.page.getByRole("listitem").filter({ has: captain.page.getByRole("heading", { name: /Taart\sin\szeven/ }) });
  await taart.getByRole("button", { name: "Zet de joker in" }).click();
  await expect(captain.page.getByText(/De joker staat op Taart in zeven/)).toBeVisible();
  // Other phones do not see a joker before the game starts.
  const zeskampVoor = await (await familie.page.request.get("/api/zeskamp")).json();
  expect(zeskampVoor.games[0].jokers).toEqual([]);

  // A spelleider starts game 1: the lock closes.
  const sl = await nieuwToestel(browser);
  await loginSpelleider(sl.page, kees, "Kees");
  const spel = await onderdeelId("Taart in zeven");
  const start = await sl.page.request.post("/api/zeskamp/start", { data: { eventId: spel } });
  expect(await start.json()).toEqual({ status: "gestart" });

  // At the start the joker is fixed.
  await captain.page.reload();
  await expect(captain.page.getByText(/Ligt vast bij Taart in zeven/)).toBeVisible();
  await expect(taart.getByRole("button", { name: /joker/ })).toHaveCount(0);

  // The result: fewest grams wins; Petrol first with the joker (20 points).
  const ids = await teamIds();
  const grams: Record<string, number> = { "Team Oranje": 18, "Team Mosterd": 40, "Team Avocado": 25, "Team Petrol": 12 };
  const uitslag = await sl.page.request.post("/api/zeskamp/uitslag", {
    data: { clientId: "taart-uitslag-0001", eventId: spel, values: Object.entries(grams).map(([team, value]) => ({ teamId: ids[team], value })) },
  });
  expect(await uitslag.json()).toEqual({ status: "ontvangen" });

  // After the lock these numbers exist: totals 204, 180, 312 and 96, and the
  // game points 240, 84, 60 and 36. None of them may reach a public screen.
  const naHetSlot = [/"twelfths":204\b/, /"twelfths":180\b/, /"twelfths":312\b/, /"twelfths":240\b/, /"twelfths":84\b/];

  const ans_ = await nieuwToestel(browser);
  await loginSpelleider(ans_.page, ans, "Ans");

  for (const [wie, toestel] of [
    ["familie", familie.page],
    ["captain", captain.page],
    ["spelleider", sl.page],
    ["andere spelleider", ans_.page],
  ] as const) {
    const view = await score(toestel);
    expect(view.show, wie).toBe("momentopname");
    expect(totalen(view.standings), wie).toEqual(STAND_VOOR);
    expect(view.standings.flatMap((row) => row.breakdown).some((item) => item.kind === "zeskamp"), wie).toBe(false);
    expect(view.parts.find((part) => part.name === "Taart in zeven"), wie).toMatchObject({ status: "klaar", played: true });
    expect(view.jokers.map((joker) => `${joker.team.name} bij ${joker.label}`), wie).toContain("Team Petrol bij spel 1");
    const json = JSON.stringify(view);
    for (const pattern of naHetSlot) expect(json, `${wie}: ${pattern}`).not.toMatch(pattern);

    const zeskamp = await (await toestel.request.get("/api/zeskamp")).json();
    expect(zeskamp.locked, wie).toBe(true);
    expect(zeskamp.games.every((game: { results: unknown }) => game.results === null), wie).toBe(true);
    expect(JSON.stringify(zeskamp), wie).not.toContain("twelfths");

    const ceremonie = await (await toestel.request.get("/api/ceremonie")).json();
    expect(JSON.stringify(ceremonie), wie).not.toContain("twelfths");
  }

  // The spelleider who entered the game sees its places and points; another spelleider does not.
  const eigen = await (await sl.page.request.get(`/api/zeskamp/${spel}`)).json();
  expect(eigen.results.find((row: { team: { name: string } }) => row.team.name === "Team Petrol")).toMatchObject({ place: 1, twelfths: 240, joker: true });
  const ander = await (await ans_.page.request.get(`/api/zeskamp/${spel}`)).json();
  expect(ander.results).toBeNull();
  expect(ander.entered.by).toBe("Kees");
  // The family cannot open the spelleider API at all.
  expect((await familie.page.request.get(`/api/zeskamp/${spel}`)).status()).toBe(401);

  // The page itself: the snapshot, the lock and the played games.
  await familie.page.goto("/score");
  await expect(familie.page.getByText(/Op slot tot de prijsuitreiking/)).toBeVisible();
  const petrol = familie.page.getByRole("listitem").filter({ hasText: "Team Petrol" }).first();
  await expect(petrol).toContainText("6");
  await expect(petrol).not.toContainText("26");
  await expect(familie.page.getByText(/Joker al gebruikt: Team Petrol bij spel\s1/)).toBeVisible();

  // The admin sees the real standings…
  const admin = await score(page);
  expect(admin.show).toBe("live");
  expect(totalen(admin.standings)).toEqual([
    ["Team Petrol", 312],
    ["Team Avocado", 204],
    ["Team Oranje", 180],
    ["Team Mosterd", 96],
  ]);

  // …unless he wants to be surprised too: then no number at all.
  await page.goto("/beheer/scorebord");
  await page.getByRole("switch", { name: /Ik wil zelf ook verrast\sworden/ }).click();
  await expect(page.getByRole("switch", { name: /Ik wil zelf ook verrast\sworden/ })).toHaveAttribute("aria-checked", "true");
  const verrast = await score(page);
  expect(verrast.show).toBe("verrast");
  expect(JSON.stringify(verrast)).not.toMatch(/"twelfths":-?\d/);
  // The zeskamp screen keeps the surprise too.
  const zeskampVerrast = await (await page.request.get("/api/zeskamp")).json();
  expect(zeskampVerrast.games.every((game: { results: unknown }) => game.results === null)).toBe(true);
  await page.getByRole("switch", { name: /Ik wil zelf ook verrast\sworden/ }).click();
  await expect(page.getByRole("switch", { name: /Ik wil zelf ook verrast\sworden/ })).toHaveAttribute("aria-checked", "false");

  // The admin's override: open shows everyone the real standings, closing again takes a new snapshot.
  await page.getByLabel(/Ja, iedereen mag de echte stand weer\szien/).check();
  await page.getByRole("button", { name: "Open het slot" }).click();
  await expect(page.getByText("Het slot is open. Iedereen ziet de echte stand.")).toBeVisible();
  const open = await score(familie.page);
  expect(open.show).toBe("live");
  expect(totalen(open.standings)[0]).toEqual(["Team Petrol", 312]);
  await page.getByRole("button", { name: "Zet het slot nu dicht" }).click();
  await expect(page.getByText("Het slot is dicht. De stand van nu is bewaard.")).toBeVisible();
  const opnieuw = await score(familie.page);
  expect(opnieuw.show).toBe("momentopname");
  expect(totalen(opnieuw.standings)[0]).toEqual(["Team Petrol", 312]);

  const sql = db();
  try {
    const acties = await sql<{ action: string }[]>`select action from valk.audit_log where action like 'slot.%' order by id`;
    expect(acties.map((row) => row.action)).toEqual(["slot.dicht", "slot.open", "slot.dicht"]);
  } finally {
    await sql.end();
  }

  for (const toestel of [familie, captain, sl, ans_]) await toestel.context.close();
});
