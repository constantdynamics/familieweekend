import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

/**
 * One small connection pool per server instance. On Vercel this talks to the
 * Supabase pooler in transaction mode, so prepared statements are off.
 * Every query names the `valk` schema explicitly.
 */
declare global {
  var __valkSql: postgres.Sql | undefined;
}

export function db(): postgres.Sql {
  if (!globalThis.__valkSql) {
    const env = serverEnv();
    globalThis.__valkSql = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: env.DATABASE_SSL === "require" ? "require" : false,
      connection: { application_name: "valkenburger-spelen" },
    });
  }
  return globalThis.__valkSql;
}
