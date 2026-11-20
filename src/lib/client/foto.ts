"use client";

/**
 * Make a photo smaller in the browser before it goes up (SPEC §4.2: at most
 * 1600 px, as JPEG). Respects the camera's rotation.
 */
export async function verkleinFoto(
  file: File,
  maxZijde = 1600,
  kwaliteit = 0.85,
): Promise<{ blob: Blob; breedte: number; hoogte: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const schaal = Math.min(1, maxZijde / Math.max(bitmap.width, bitmap.height));
  const breedte = Math.max(1, Math.round(bitmap.width * schaal));
  const hoogte = Math.max(1, Math.round(bitmap.height * schaal));
  const canvas = document.createElement("canvas");
  canvas.width = breedte;
  canvas.height = hoogte;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Geen canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, breedte, hoogte);
  context.drawImage(bitmap, 0, 0, breedte, hoogte);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", kwaliteit));
  if (!blob) throw new Error("Kon de foto niet maken");
  return { blob, breedte, hoogte };
}

export type UploadSoort = "funfact" | "ai" | "bord" | "quiz";

/** Make smaller and upload. Returns the id and a short-lived link, or a Dutch error. */
export async function uploadFoto(
  file: File,
  soort: UploadSoort,
  opties: { deelnemer?: string; maxZijde?: number } = {},
): Promise<{ id: string; url: string } | { fout: string }> {
  let klein: { blob: Blob; breedte: number; hoogte: number };
  try {
    klein = await verkleinFoto(file, opties.maxZijde ?? (soort === "bord" ? 1280 : 1600));
  } catch {
    return { fout: "Deze foto kan de app niet openen. Kies een andere, bijvoorbeeld een JPG." };
  }
  const form = new FormData();
  form.set("foto", new File([klein.blob], "foto.jpg", { type: "image/jpeg" }));
  form.set("soort", soort);
  form.set("breedte", String(klein.breedte));
  form.set("hoogte", String(klein.hoogte));
  if (opties.deelnemer) form.set("deelnemer", opties.deelnemer);
  try {
    const response = await fetch("/api/foto", { method: "POST", body: form, credentials: "same-origin" });
    const data = (await response.json()) as { id?: string; url?: string; fout?: string };
    if (!response.ok || !data.id || !data.url) return { fout: data.fout ?? "Uploaden lukte niet. Probeer het nog eens." };
    return { id: data.id, url: data.url };
  } catch {
    return { fout: "Geen verbinding. Probeer het opnieuw als je weer internet hebt." };
  }
}
