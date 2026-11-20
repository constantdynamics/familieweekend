import { readUploadBytes, verifyPhotoSignature } from "@/lib/server/uploads";
import { isUuid } from "@/lib/server/teams";

/** A photo, only with a valid signed link that has not expired. */
export async function GET(request: Request, { params }: RouteContext<"/api/foto/[id]">) {
  const { id } = await params;
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get("t"));
  const sig = url.searchParams.get("s") ?? "";
  if (!isUuid(id) || !(await verifyPhotoSignature(id, expires, sig))) {
    return new Response("Deze link is verlopen.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const photo = await readUploadBytes(id);
  if (!photo) return new Response("Niet gevonden.", { status: 404 });
  const maxAge = Math.max(0, Math.floor(expires - Date.now() / 1000));
  return new Response(photo.bytes as BodyInit, {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": `private, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
