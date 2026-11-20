import "server-only";
import { z } from "zod";

/**
 * Server-side configuration. Values come from environment variables only
 * (Vercel project settings or a local `.env.local`), never from the repo.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL ontbreekt"),
  /** Master secret; sub-keys for sessions and peppers are derived from it. */
  APP_SECRET: z.string().min(32, "APP_SECRET moet minstens 32 tekens zijn"),
  /** Shared secret Vercel Cron sends as `Authorization: Bearer …`. */
  CRON_SECRET: z.string().min(16).optional(),
  /** "require" for Supabase, "disable" for a local database. */
  DATABASE_SSL: z.enum(["require", "disable"]).default("require"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Serverconfiguratie onvolledig: ${issues.join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";
