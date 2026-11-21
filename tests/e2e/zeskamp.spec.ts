/**
 * SPEC §7.5: a zeskamp game with equal times and offline input. The
 * spelleider's stopwatch runs on a fake clock, so two teams stop on exactly
 * the same hundredth. The result is sent while the phone is offline, goes
 * out once the network is back, and counts once.
 */
import { expect, test } from "@playwright/test";
import { db, resetState } from "./helpers";
import { binnen, loginBeheerder, loginSpelleider, maakSpelleider, nieuwToestel, onderdeelId, ZONDER_SERVICE_WORKER } from "./zeskamp-hulp";

test.use(ZONDER_SERVICE_WORKER);

test.beforeEach(async () => {
  await resetState();
});

type Uitslag = { team_id: string; name: string; raw_value: number; entered_by: string; client_id: string | null };

async function uitslagen(spel: string): Promise<Uitslag[]> {
  const sql = db();
  try {
    return await sql<Uitslag[]>`
      select r.team_id, t.name, r.raw_value, r.entered_by, r.client_id
      from valk.event_results r join valk.teams t on t.id = r.team_id
      where r.event_id = ${spel} order by t.sort
    `;
  } finally {
    await sql.end();
  }
}

async function slot(): Promise<{ lock_closed: boolean; snapshots: number; status: string }> {
  const sql = db();
  try {
    const [row] = await sql<{ lock_closed: boolean; snapshots: number; status: string }[]>`
      select l.lock_closed,
        (select count(*)::int from valk.scoreboard_snapshots where env = 'live') as snapshots,
        (select status from valk.events where env = 'live' and name = 'Zaklopen-estafette') as status
      from valk.live_state l where l.env = 'live'
    `;
    return row;
  } finally {
    await sql.end();
  }
}

test("gelijke tijden delen de punten, en een uitslag komt offline toch aan", async ({ page, browser }) => {
  await binnen(page);
  await loginBeheerder(page);
  const pin = await maakSpelleider(page, "Kees");
  const spel = await onderdeelId("Zaklopen-estafette");

  // The admin puts the joker of Team Mosterd on this game.
  await page.goto(`/beheer/zeskamp/${spel}`);
  await page.getByLabel("Zet de joker van").selectOption({ label: "Team Mosterd" });
  await page.getByRole("button", { name: "Zet de joker op dit spel" }).click();
  await expect(page.getByText("De joker staat op Zaklopen-estafette.")).toBeVisible();

  const spelleider = await nieuwToestel(browser);
  const sl = spelleider.page;
  await sl.clock.install({ time: new Date("2027-05-08T10:00:00+02:00") });
  await loginSpelleider(sl, pin, "Kees");
  await sl.goto("/spelleider/zeskamp");
  await sl.getByRole("link", { name: /Zaklopen-estafette/ }).click();
  await expect(sl.getByRole("heading", { level: 1, name: "Zaklopen-estafette" })).toBeVisible();
  await expect(sl.getByText("Joker: Team Mosterd")).toBeVisible();
  await expect(sl.getByText("Klaar voor de start")).toBeVisible();

  // Time stands still between the clicks: two teams finish on the same hundredth.
  await sl.clock.pauseAt(new Date("2027-05-08T10:05:00+02:00"));
  await sl.getByRole("button", { name: "Start de tijd" }).click();
  await sl.clock.fastForward(41_200);
  await sl.getByRole("button", { name: /Stop Oranje/ }).click();
  await sl.getByRole("button", { name: /Stop Mosterd/ }).click();
  await sl.clock.fastForward(1_850);
  await sl.getByRole("button", { name: /Stop Avocado/ }).click();
  await sl.clock.fastForward(8_000);
  await sl.getByRole("button", { name: /Stop Petrol/ }).click();

  // Shared first place: (10 + 7) / 2 = 8,5 each, and 17 with the joker.
  const oranje = sl.getByRole("button", { name: /Binnen Oranje/ });
  const mosterd = sl.getByRole("button", { name: /Binnen Mosterd/ });
  await expect(oranje).toContainText("00:41,20");
  await expect(oranje).toContainText("8,5");
  await expect(oranje).toContainText("Plaats 1");
  await expect(mosterd).toContainText("00:41,20");
  await expect(mosterd).toContainText("17");
  await expect(mosterd).toContainText("Plaats 1");
  await expect(sl.getByRole("button", { name: /Binnen Avocado/ })).toContainText("00:43,05");
  await expect(sl.getByRole("button", { name: /Binnen Avocado/ })).toContainText("Plaats 3");
  await expect(sl.getByRole("button", { name: /Binnen Petrol/ })).toContainText("00:51,05");
  await expect(sl.getByText("Alle teams binnen, controleer en verstuur")).toBeVisible();

  // The start reached the server: the game runs and the lock closed with a snapshot.
  await expect.poll(slot).toEqual({ lock_closed: true, snapshots: 1, status: "bezig" });

  // Offline: the result waits on the phone.
  await spelleider.context.setOffline(true);
  await sl.getByRole("button", { name: "Verstuur uitslag" }).click();
  await expect(sl.getByText(/Wacht op verbinding/)).toBeVisible();
  expect(await uitslagen(spel)).toEqual([]);

  // Back online: it goes out by itself.
  await sl.clock.resume();
  await spelleider.context.setOffline(false);
  await expect(sl.getByText(/Uitslag verstuurd/)).toBeVisible({ timeout: 15_000 });

  const rows = await uitslagen(spel);
  expect(rows.map((row) => [row.name, row.raw_value])).toEqual([
    ["Team Oranje", 41.2],
    ["Team Mosterd", 41.2],
    ["Team Avocado", 43.05],
    ["Team Petrol", 51.05],
  ]);
  expect(new Set(rows.map((row) => row.entered_by))).toEqual(new Set(["Kees"]));
  expect(new Set(rows.map((row) => row.client_id)).size).toBe(1);
  expect((await slot()).status).toBe("klaar");

  // Sent again (the queue retried): counted once. Another submission: refused.
  const values = rows.map((row) => ({ teamId: row.team_id, value: row.raw_value }));
  const again = await sl.request.post("/api/zeskamp/uitslag", { data: { clientId: rows[0].client_id, eventId: spel, values } });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ status: "al-ontvangen" });
  const other = await sl.request.post("/api/zeskamp/uitslag", { data: { clientId: "een-andere-invoer-1234", eventId: spel, values } });
  expect(other.status()).toBe(409);
  expect(await uitslagen(spel)).toHaveLength(4);

  // The admin corrects one time; the old value stays in the logbook.
  await page.goto(`/beheer/zeskamp/${spel}`);
  const lijst = page.getByRole("list", { name: "Plaatsen en punten" });
  await expect(lijst).toContainText("Team Mosterd, joker, gedeeld");
  await expect(lijst).toContainText("17");
  await page.getByLabel("Team Avocado", { exact: true }).fill("0:41,20");
  await page.getByRole("button", { name: "Bewaar uitslag" }).click();
  await expect(page.getByText("Uitslag bewaard. De oude waarden staan in het logboek.")).toBeVisible();
  // Three teams share first place now: (10 + 7 + 5) / 3 = 7,3.
  await expect(lijst).toContainText("Team Avocado, gedeeld");
  await expect(lijst.getByText("7,3").first()).toBeVisible();

  const sql = db();
  try {
    const [log] = await sql<{ old_value: unknown; new_value: unknown; actor_name: string }[]>`
      select old_value, new_value, actor_name from valk.audit_log where action = 'uitslag.gecorrigeerd' order by id desc limit 1
    `;
    expect(log.old_value).toEqual({ spel: "Zaklopen-estafette", uitslag: { "Team Avocado": "00:43,05" } });
    expect(log.new_value).toEqual({ spel: "Zaklopen-estafette", uitslag: { "Team Avocado": "00:41,20" } });
    const [ingevoerd] = await sql<{ actor_name: string }[]>`
      select actor_name from valk.audit_log where action = 'uitslag.ingevoerd' order by id desc limit 1
    `;
    expect(ingevoerd.actor_name).toBe("Kees");
  } finally {
    await sql.end();
  }

  await spelleider.context.close();
});

test("na elkaar: elk team een eigen start en stop, ook na herladen", async ({ page, browser }) => {
  await binnen(page);
  await loginBeheerder(page);
  const pin = await maakSpelleider(page, "Ans");
  const spel = await onderdeelId("Blind parcours met dierengeluiden");

  const spelleider = await nieuwToestel(browser);
  const sl = spelleider.page;
  await sl.clock.install({ time: new Date("2027-05-08T11:00:00+02:00") });
  await loginSpelleider(sl, pin, "Ans");
  await sl.goto(`/spelleider/zeskamp/${spel}`);
  await expect(sl.getByRole("button", { name: "Start Team Oranje" })).toBeVisible();
  await sl.clock.pauseAt(new Date("2027-05-08T11:05:00+02:00"));

  const tijden: [string, number][] = [
    ["Team Oranje", 61_500],
    ["Team Mosterd", 58_250],
    ["Team Avocado", 75_000],
    ["Team Petrol", 61_500],
  ];
  for (const [team, ms] of tijden) {
    await sl.getByRole("button", { name: `Start ${team}` }).click();
    await sl.clock.fastForward(ms);
    await sl.getByRole("button", { name: `Stop ${team}` }).click();
  }
  // What is entered survives a reload (it waits on the phone until it is sent).
  await sl.clock.resume();
  await sl.reload();
  await expect(sl.getByText("01:01,50").first()).toBeVisible();
  await sl.getByRole("button", { name: "Verstuur uitslag" }).click();
  await expect(sl.getByText(/Uitslag verstuurd/)).toBeVisible({ timeout: 15_000 });

  const rows = await uitslagen(spel);
  expect(rows.map((row) => [row.name, row.raw_value])).toEqual([
    ["Team Oranje", 61.5],
    ["Team Mosterd", 58.25],
    ["Team Avocado", 75],
    ["Team Petrol", 61.5],
  ]);
  await spelleider.context.close();
});
