/**
 * The connection pool against the local test database: after half a minute
 * without queries it starts fresh, because on Vercel the instance may have
 * been frozen and its connections may be dead without anyone noticing.
 */
import { afterAll, describe, expect, it } from "vitest";
import { appUrl } from "./testDatabase";

process.env.DATABASE_URL = appUrl;
process.env.DATABASE_SSL = "disable";
process.env.CRON_SECRET = "test-cron-geheim-0123456789";

const { db } = await import("@/lib/server/db");

afterAll(async () => {
  await db().end();
});

describe("de verbindingspool", () => {
  it("blijft dezelfde zolang er gevraagd wordt", async () => {
    const pool = db();
    await pool`select 1`;
    expect(db()).toBe(pool);
  });

  it("begint vers na een halve minuut zonder vragen, en de oude gaat dicht", async () => {
    const oud = db();
    await oud`select 1`;
    globalThis.__valkSqlUsedAt = Date.now() - 31_000;
    const nieuw = db();
    expect(nieuw).not.toBe(oud);
    await expect(nieuw<{ een: number }[]>`select 1 as een`).resolves.toEqual([{ een: 1 }]);
    await expect(oud`select 1`).rejects.toThrow();
  });
});
