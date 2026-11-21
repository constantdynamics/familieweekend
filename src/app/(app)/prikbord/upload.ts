"use client";

import { uploadFoto, verkleinFoto } from "@/lib/client/foto";
import { STAFF_AS } from "@/lib/shared/board";

const GEEN_VERBINDING = "Geen verbinding. Probeer het opnieuw als je weer internet hebt.";

/**
 * Upload a board photo (made smaller to at most 1280 px first). For a name
 * on this phone through the general photo route; for "De spelleiding"
 * through the board's own route, because the admin posts without a name.
 */
export async function uploadBoardPhoto(file: File, as: string): Promise<{ id: string; url: string } | { fout: string }> {
  if (as !== STAFF_AS) return uploadFoto(file, "bord", { deelnemer: as });
  let klein: { blob: Blob; breedte: number; hoogte: number };
  try {
    klein = await verkleinFoto(file, 1280);
  } catch {
    return { fout: "Deze foto kan de app niet openen. Kies een andere, bijvoorbeeld een JPG." };
  }
  const form = new FormData();
  form.set("foto", new File([klein.blob], "foto.jpg", { type: "image/jpeg" }));
  form.set("breedte", String(klein.breedte));
  form.set("hoogte", String(klein.hoogte));
  try {
    const response = await fetch("/api/prikbord/foto", { method: "POST", body: form, credentials: "same-origin" });
    const data = (await response.json()) as { id?: string; url?: string; fout?: string };
    if (!response.ok || !data.id || !data.url) return { fout: data.fout ?? "Uploaden lukte niet. Probeer het nog eens." };
    return { id: data.id, url: data.url };
  } catch {
    return { fout: GEEN_VERBINDING };
  }
}
