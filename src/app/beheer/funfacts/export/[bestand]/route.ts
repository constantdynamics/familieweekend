import { connection } from "next/server";
import { logAudit } from "@/lib/server/audit";
import { getRequestContext } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { exportData, exportPhotos, type ExportData, type StoredAnswer } from "@/lib/server/funfacts";
import { logError } from "@/lib/server/log";
import { readUploadBytes } from "@/lib/server/uploads";
import { zipStream, type ZipEntry } from "@/lib/server/zip";
import { splitIntoParts, toCsv, uploadIdOf, ZIP_PART_BYTES, type FunfactValue } from "@/lib/shared/funfacts";
import { amsterdamParts } from "@/lib/shared/time";

/**
 * Export of all fun facts (SPEC §4.11): CSV and JSON with every answer, and
 * the photos as a zip (in parts, so each download stays small). Admin only;
 * every download is written in the logbook.
 */

const NO_STORE = { "Cache-Control": "no-store, private" };

function stamp(): string {
  const p = amsterdamParts(new Date());
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** An answer as plain data: true, 12, "Koffie", a text, or { foto: file name }. */
function plain(value: FunfactValue, photoName: Map<string, string>): unknown {
  if ("bool" in value) return value.bool;
  if ("number" in value) return value.number;
  if ("choice" in value) return value.choice;
  if ("text" in value) return value.text;
  return { foto: photoName.get(value.upload) ?? value.upload };
}

function csvValue(answer: StoredAnswer | undefined, photoName: Map<string, string>): string {
  if (!answer) return "";
  if (answer.skipped || !answer.value) return "overgeslagen";
  const upload = uploadIdOf(answer.value);
  if (upload) return `foto: ${photoName.get(upload) ?? upload}`;
  const value = plain(answer.value, photoName);
  return typeof value === "boolean" ? (value ? "ja" : "nee") : String(value);
}

function asCsv(data: ExportData, photoName: Map<string, string>): string {
  const header = [
    "Naam",
    "Roepnaam",
    "Team",
    "Klaar",
    ...data.questions.map((q, i) => `${i + 1}. ${q.text}${q.active ? "" : " (staat uit)"}`),
  ];
  const rows = data.people.map((person) => {
    const answers = data.answers.get(person.id);
    return [
      person.name,
      person.nickname ?? "",
      person.team ?? "",
      person.doneAt ? "ja" : "nee",
      ...data.questions.map((q) => csvValue(answers?.get(q.id), photoName)),
    ];
  });
  return toCsv([header, ...rows]);
}

function asJson(data: ExportData, photoName: Map<string, string>, env: string) {
  const nummer = new Map(data.questions.map((q, i) => [q.id, i + 1]));
  return {
    geexporteerd: new Date().toISOString(),
    omgeving: env === "test" ? "proef" : "echt",
    vragen: data.questions.map((q, i) => ({
      nr: i + 1,
      soort: q.kind,
      vraag: q.text,
      uitleg: q.hint,
      opties: q.options,
      min: q.min,
      max: q.max,
      quizvorm: q.quizForm,
      actief: q.active,
    })),
    deelnemers: data.people.map((person) => ({
      naam: person.name,
      roepnaam: person.nickname,
      team: person.team,
      klaar: person.doneAt !== null,
      antwoorden: data.questions
        .map((q) => data.answers.get(person.id)?.get(q.id))
        .filter((a): a is StoredAnswer => a !== undefined)
        .map((a) => ({
          nr: nummer.get(a.questionId),
          vraag: data.questions.find((q) => q.id === a.questionId)?.text ?? "",
          antwoord: a.skipped || !a.value ? null : plain(a.value, photoName),
          overgeslagen: a.skipped,
        })),
    })),
  };
}

export async function GET(request: Request, { params }: RouteContext<"/beheer/funfacts/export/[bestand]">) {
  await connection();
  const ctx = await getRequestContext();
  if (!ctx.isAdmin || !ctx.staff) {
    return Response.json({ fout: "Alleen de beheerder kan de fun facts downloaden." }, { status: 403, headers: NO_STORE });
  }
  const { bestand } = await params;
  if (bestand !== "funfacts.csv" && bestand !== "funfacts.json" && bestand !== "fotos.zip") {
    return Response.json({ fout: "Onbekend bestand." }, { status: 404, headers: NO_STORE });
  }
  const prefix = ctx.env === "test" ? "funfacts-proef" : "funfacts";
  const actor = { id: ctx.staff.staffId, name: ctx.staff.name, role: ctx.staff.role };

  try {
    const photos = await exportPhotos(ctx.env);
    const photoName = new Map(photos.map((p) => [p.id, p.fileName]));

    if (bestand === "fotos.zip") {
      const parts = splitIntoParts(photos, ZIP_PART_BYTES);
      const deel = Number(new URL(request.url).searchParams.get("deel") ?? "1");
      if (!Number.isInteger(deel) || deel < 1 || deel > Math.max(1, parts.length)) {
        return Response.json({ fout: "Dit deel bestaat niet." }, { status: 404, headers: NO_STORE });
      }
      const files = parts[deel - 1] ?? [];
      await logAudit(actor, { action: "funfacts.export", entity: "funfacts", newValue: { bestand, deel, fotos: files.length } }, db(), ctx.env);
      async function* entries(): AsyncGenerator<ZipEntry> {
        for (const file of files) {
          const photo = await readUploadBytes(file.id);
          if (photo) yield { name: file.fileName, data: photo.bytes, date: file.createdAt };
        }
      }
      const name = parts.length > 1 ? `${prefix}-fotos-${stamp()}-deel-${deel}.zip` : `${prefix}-fotos-${stamp()}.zip`;
      return new Response(zipStream(entries()), {
        headers: { ...NO_STORE, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` },
      });
    }

    const data = await exportData(ctx.env);
    await logAudit(actor, { action: "funfacts.export", entity: "funfacts", newValue: { bestand, deelnemers: data.people.length } }, db(), ctx.env);
    if (bestand === "funfacts.csv") {
      return new Response(asCsv(data, photoName), {
        headers: {
          ...NO_STORE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${prefix}-${stamp()}.csv"`,
        },
      });
    }
    return new Response(JSON.stringify(asJson(data, photoName, ctx.env), null, 2), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${prefix}-${stamp()}.json"`,
      },
    });
  } catch (error) {
    logError("funfacts.export", error);
    return Response.json({ fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." }, { status: 500, headers: NO_STORE });
  }
}
