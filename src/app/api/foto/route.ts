import { connection } from "next/server";
import { getRequestContext } from "@/lib/server/context";
import { logError } from "@/lib/server/log";
import { getSettings } from "@/lib/server/settings";
import { MAX_UPLOAD_BYTES, saveUpload, signedPhotoUrl, sniffImage, type UploadKind } from "@/lib/server/uploads";

/**
 * Upload one photo (already made smaller in the browser). Who may upload
 * what: fun facts and board photos by someone who chose a name on this
 * device; AI versions and quiz photos only by the admin.
 */
export async function POST(request: Request) {
  await connection();
  const ctx = await getRequestContext();
  if (!ctx.deviceId) return Response.json({ fout: "Vul eerst de familiecode in." }, { status: 401 });
  if (ctx.viewAs) return Response.json({ fout: "Je bekijkt de app als iemand anders." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ fout: "Deze foto kwam niet goed aan. Probeer het nog eens." }, { status: 400 });
  }
  const kind = String(form.get("soort") ?? "") as UploadKind;
  const file = form.get("foto");
  const participantId = String(form.get("deelnemer") ?? "") || null;
  if (!(file instanceof File)) return Response.json({ fout: "Kies eerst een foto." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ fout: "Deze foto is te groot. Kies een kleinere." }, { status: 413 });
  }

  if (kind === "funfact" || kind === "bord") {
    if (!participantId || !ctx.names.some((n) => n.id === participantId)) {
      return Response.json({ fout: "Kies eerst je naam." }, { status: 403 });
    }
    const settings = await getSettings();
    const now = Date.now();
    if (kind === "funfact" && (now < Date.parse(settings.funfactsOpenAt) || now > Date.parse(settings.funfactsDeadline))) {
      return Response.json({ fout: "De fun facts zijn nu dicht." }, { status: 403 });
    }
    if (kind === "bord" && !settings.boardOpen) {
      return Response.json({ fout: "Het prikbord is even dicht." }, { status: 403 });
    }
  } else if (kind === "ai" || kind === "quiz") {
    if (!ctx.isAdmin) return Response.json({ fout: "Alleen de beheerder kan dit." }, { status: 403 });
  } else {
    return Response.json({ fout: "Onbekende soort foto." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return Response.json({ fout: "Dit is geen foto die de app kan lezen. Kies een JPG of PNG." }, { status: 415 });

  try {
    const width = Number(form.get("breedte")) || null;
    const height = Number(form.get("hoogte")) || null;
    const id = await saveUpload({
      kind,
      bytes,
      mime,
      width,
      height,
      participantId: kind === "funfact" || kind === "bord" ? participantId : null,
      createdBy: ctx.staff?.name ?? ctx.names.find((n) => n.id === participantId)?.displayName ?? "onbekend",
    });
    return Response.json({ id, url: await signedPhotoUrl(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("foto.upload", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." }, { status: 500 });
  }
}
