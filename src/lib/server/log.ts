import "server-only";

/**
 * Simple error logging: one JSON line per error, readable in the Vercel logs.
 * Never pass codes, PINs or cookies in `context`.
 */
export function logError(where: string, error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error };
  console.error(JSON.stringify({ level: "error", where, ...err, ...context, at: new Date().toISOString() }));
}
