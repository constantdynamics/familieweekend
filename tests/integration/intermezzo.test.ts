/**
 * The intermezzo against a real database (the test environment of the local
 * test database): drawing, secret choices, the reveal, a draw and the
 * winner staying on.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/valk_test";
const appPassword = /^VALK_APP_PASSWORD=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim() ?? "";
process.env.DATABASE_URL = adminUrl.replace("postgres:postgres@", `valk_app:${appPassword}@`);
process.env.DATABASE_SSL = "disable";
process.env.CRON_SECRET = "test-cron-geheim-0123456789";

const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
const actor = { id: null, name: "Test", role: "beheerder" };

type Module = typeof import("@/lib/server/intermezzo");
let m: Module;

beforeAll(async () => {
  execFileSync("npx", ["tsx", "tests/e2e/prepare.ts"], { env: { ...process.env, E2E_DB: "valk_test" }, stdio: "pipe" });
  const proef = await import("@/lib/server/proef");
  await proef.setUpTestEnvironment(actor);
  await sql`update valk.live_state set mode = 'intermezzo' where env = 'test'`;
  m = await import("@/lib/server/intermezzo");
}, 120_000);

afterAll(async () => {
  await sql.end();
  const { db } = await import("@/lib/server/db");
  await db().end();
});

async function teamOf(id: string): Promise<string> {
  const [row] = await sql<{ team_id: string }[]>`select team_id from valk.participants where id = ${id}`;
  return row.team_id;
}

async function revealNow() {
  await sql`update valk.duels set reveal_at = now() - interval '1 second' where env = 'test'`;
}

describe("intermezzo", () => {
  it("loot twee spelers uit verschillende teams", async () => {
    expect(await m.drawNext("test", actor)).toEqual({ ok: true });
    const view = await m.intermezzoView("test", []);
    expect(view.active).toBe(true);
    expect(view.duel?.status).toBe("kiezen");
    expect(await teamOf(view.duel!.champion.id)).not.toBe(await teamOf(view.duel!.challenger.id));
    // A second draw while the duel runs is refused.
    expect(await m.drawNext("test", actor)).toHaveProperty("fout");
  });

  it("houdt de keuzes geheim tot na het aftellen", async () => {
    const before = await m.intermezzoView("test", []);
    const { champion, challenger } = before.duel!;
    const mine = await m.intermezzoView("test", [champion.id]);
    expect(mine.mustChoose.map((p) => p.id)).toEqual([champion.id]);

    expect(await m.choose("test", champion.id, "kanon", [champion.id])).toHaveProperty("fout");
    expect(await m.choose("test", champion.id, "steen", [challenger.id])).toHaveProperty("fout");
    expect(await m.choose("test", champion.id, "steen", [champion.id])).toEqual({ ok: true });

    const halfway = await m.intermezzoView("test", []);
    expect(halfway.duel?.championChose).toBe(true);
    expect(halfway.duel?.championChoice).toBeNull();

    expect(await m.choose("test", challenger.id, "schaar", [challenger.id])).toEqual({ ok: true });
    const counting = await m.intermezzoView("test", []);
    expect(counting.duel?.status).toBe("aftellen");
    expect(counting.duel?.championChoice).toBeNull();
    expect(counting.duel?.winnerId).toBeNull();
    expect(JSON.stringify(counting)).not.toContain("schaar");

    await revealNow();
    const revealed = await m.intermezzoView("test", []);
    expect(revealed.duel?.status).toBe("klaar");
    expect(revealed.duel?.championChoice).toBe("steen");
    expect(revealed.duel?.challengerChoice).toBe("schaar");
    expect(revealed.duel?.winnerId).toBe(champion.id);
    expect(revealed.duelCount).toBe(1);
  });

  it("laat de winnaar staan en loot een uitdager uit een ander team", async () => {
    const previous = (await m.intermezzoView("test", [])).duel!;
    expect(await m.drawNext("test", actor)).toEqual({ ok: true });
    const next = (await m.intermezzoView("test", [])).duel!;
    expect(next.seq).toBe(previous.seq + 1);
    expect(next.champion.id).toBe(previous.winnerId);
    expect(await teamOf(next.challenger.id)).not.toBe(await teamOf(next.champion.id));
    expect([previous.champion.id, previous.challenger.id]).not.toContain(next.challenger.id);
  });

  it("laat bij gelijkspel opnieuw kiezen", async () => {
    const duel = (await m.intermezzoView("test", [])).duel!;
    await m.choose("test", duel.champion.id, "papier", [duel.champion.id]);
    await m.choose("test", duel.challenger.id, "papier", [duel.challenger.id]);
    await revealNow();
    const tie = await m.intermezzoView("test", []);
    expect(tie.duel?.status).toBe("gelijk");
    await sql`update valk.duels set reveal_at = now() - interval '5 seconds' where env = 'test' and status = 'onthullen'`;
    const again = await m.intermezzoView("test", []);
    expect(again.duel?.status).toBe("kiezen");
    expect(again.duel?.championChose).toBe(false);
  });

  it("speelt een duel in het echt en telt de reeks", async () => {
    const duel = (await m.intermezzoView("test", [])).duel!;
    expect(await m.playInRealLife("test", actor)).toEqual({ ok: true });
    expect(await m.chooseWinnerInRealLife("test", duel.champion.id, actor)).toEqual({ ok: true });
    const view = await m.intermezzoView("test", []);
    expect(view.duel?.winnerId).toBe(duel.champion.id);
    expect(view.duelCount).toBe(2);
    expect(view.current?.count).toBe(2);
    expect(view.wins.reduce((sum, t) => sum + t.wins, 0)).toBe(2);
  });
});
