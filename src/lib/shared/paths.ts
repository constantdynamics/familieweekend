/** Only same-site paths, never back to the code screen itself. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (path.startsWith("/welkom") || path.startsWith("/api/")) return "/";
  return path;
}
