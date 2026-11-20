/** Only same-site paths, never back to the code screen itself. */
export function safeReturnPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (path.startsWith("/welkom") || path.startsWith("/api/")) return fallback;
  return path;
}
