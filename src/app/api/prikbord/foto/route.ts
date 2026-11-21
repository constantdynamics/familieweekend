import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { BOARD } from "@/lib/shared/board";
import { MAX_UPLOAD_BYTES, saveUpload, signedPhotoUrl, sniffImage } from "@/lib/server/uploads";

/**
 * A photo for a post of "De spelleiding". The general photo route only
 * takes board photos from someone who chose a name; the admin posts without
 * one. Already made smaller in the browser.
 */
export async function POST(request: Request) {
  await connection();
  const ctx = await getRequestContext();
  if (!ctx.isAdmin || !ctx.staff || ctx.viewAs) {
    return Response.json({ fout: "Alleen de beheerder kan dit." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ fout: "Deze foto kwam niet goed aan. Probeer het nog eens." }, { status: 400 });
  }
  const file = form.get("foto");
  if (!(file instanceof File)) return Response.json({ fout: "Kies eerst een foto." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ fout: "Deze foto is te groot. Kies een kleinere." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return Response.json({ fout: "Dit is geen foto die de app kan lezen. Kies een JPG of PNG." }, { status: 415 });

  try {
    const id = await saveUpload({
      kind: "bord",
      bytes,
      mime,
      width: Number(form.get("breedte")) || null,
      height: Number(form.get("hoogte")) || null,
      participantId: null,
      createdBy: ctx.staff.name,
    });
    return Response.json(
      { id, url: await signedPhotoUrl(id, BOARD.photoTtlSeconds) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("prikbord.foto", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." }, { status: 500 });
  }
}
