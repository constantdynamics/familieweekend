import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

/**
 * One small connection pool per server instance. On Vercel this talks to the
 * Supabase pooler in transaction mode, so prepared statements are off.
 * Every query names the `valk` schema explicitly.
 *
 * One query at a time per connection (`max_pipeline: 1`): Supavisor, the
 * pooler behind Supabase's port 6543, hangs on pipelined queries in
 * transaction mode before version 2.10. The queries are sent, but their
 * answers never arrive (see "Connection poolers" in the postgres.js README).
 *
 * Vercel freezes an instance between visits. A connection that sat open
 * during that time can be dead without anyone noticing: a query sent over
 * it then waits until TCP gives up, minutes later, and the page hangs. So:
 * - after 30 seconds without queries we start a fresh pool before sending
 *   anything (the old one is closed at once; a query still waiting there
 *   was on a dead connection);
 * - idle connections close after 10 seconds while the instance is awake;
 * - `query_timeout` is the backstop: a query without an answer is canceled
 *   after 15 seconds and its connection replaced, so a page fails clearly
 *   instead of hanging.
 */
declare global {
  var __valkSql: postgres.Sql | undefined;
  var __valkSqlUsedAt: number | undefined;
}

const STALE_MS = 30_000;

function createPool(): postgres.Sql {
  const env = serverEnv();
  return postgres(env.DATABASE_URL, {
    prepare: false,
    max: 5,
    max_pipeline: 1,
    idle_timeout: 10,
    max_lifetime: 5 * 60,
    connect_timeout: 10,
    query_timeout: 15,
    cancel_timeout: 3,
    ssl: env.DATABASE_SSL === "require" ? "require" : false,
    connection: { application_name: "valkenburger-spelen" },
  });
}

export function db(): postgres.Sql {
  const now = Date.now();
  const pool = globalThis.__valkSql;
  if (pool && now - (globalThis.__valkSqlUsedAt ?? now) > STALE_MS) {
    globalThis.__valkSql = undefined;
    void pool.end({ timeout: 0 }).catch(() => {});
  }
  globalThis.__valkSqlUsedAt = now;
  globalThis.__valkSql ??= createPool();
  return globalThis.__valkSql;
}
