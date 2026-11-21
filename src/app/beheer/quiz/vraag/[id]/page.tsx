import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRequestContext } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { readCorrect } from "@/lib/server/quiz/answers";
import { subjectsOf } from "@/lib/server/quiz/fairness";
import { loadSubmitters, toQuestion } from "@/lib/server/quiz/store";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";
import { signedPhotoUrl } from "@/lib/server/uploads";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../../onderdelen";
import { VraagEditor, type FotoKeuze, type VraagWaarden } from "./VraagEditor";

export const metadata: Metadata = { title: "Quizvraag" };

export default function VraagPage({ params, searchParams }: PageProps<"/beheer/quiz/vraag/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function getal(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

async function Inhoud({
  params,
  searchParams,
}: {
  params: PageProps<"/beheer/quiz/vraag/[id]">["params"];
  searchParams: PageProps<"/beheer/quiz/vraag/[id]">["searchParams"];
}) {
  await requireAdmin();
  const ctx = await getRequestContext();
  const { id } = await params;
  const query = await searchParams;

  let rondeId: string;
  let waarden: VraagWaarden = {
    soort: "meerkeuze",
    vraag: "",
    opties: ["", "", "", ""],
    goedKeuze: "",
    goedWaar: "",
    goedEcht: "",
    goedGetal: "",
    eenheid: "",
    lat: "",
    lng: "",
    schaal: "nederland",
    uitleg: "",
    notitie: "",
    onderwerp: "",
    foto: "",
    fotoUrl: null,
    extraFotos: [],
    fotobron: "",
    idBestand: "",
  };
  let automatisch: string[] = [];
  let questionId: string | null = null;

  if (id === "nieuw") {
    const ronde = typeof query.ronde === "string" ? query.ronde : "";
    if (!isUuid(ronde)) notFound();
    rondeId = ronde;
  } else {
    if (!isUuid(id)) notFound();
    const [row] = await db()<Parameters<typeof toQuestion>[0][]>`select * from valk.quiz_questions where id = ${id}`;
    if (!row) notFound();
    const vraag = toQuestion(row);
    questionId = vraag.id;
    rondeId = vraag.roundId;
    const correct = readCorrect(vraag);
    const place = correct !== null && typeof correct === "object" ? (correct as { lat: number; lng: number }) : null;
    waarden = {
      ...waarden,
      soort: vraag.kind,
      vraag: vraag.text,
      opties: [0, 1, 2, 3].map((index) => vraag.options?.[index] ?? ""),
      goedKeuze: typeof correct === "number" && vraag.kind !== "schatting" ? String(correct) : "",
      goedWaar: correct === true ? "waar" : correct === false ? "niet_waar" : "",
      goedEcht: correct === "echt" || correct === "ai" ? correct : "",
      goedGetal: vraag.kind === "schatting" ? getal(correct) : "",
      eenheid: vraag.unit ?? "",
      lat: getal(place?.lat),
      lng: getal(place?.lng),
      schaal: vraag.scale ?? "nederland",
      uitleg: vraag.explanation ?? "",
      notitie: vraag.note ?? "",
      onderwerp: vraag.subjects.join(", "),
      foto: vraag.photoUploadId ?? "",
      fotoUrl: vraag.photoUploadId ? await signedPhotoUrl(vraag.photoUploadId) : null,
      extraFotos: await Promise.all((vraag.extraPhotoIds ?? []).map(async (foto) => ({ id: foto, url: await signedPhotoUrl(foto) }))),
      fotobron: vraag.photoCredit ?? "",
      idBestand: vraag.extId ?? "",
    };
    const [quiz] = await db()<{ is_demo: boolean }[]>`
      select z.is_demo from valk.quiz_rounds r join valk.quizzes z on z.id = r.quiz_id where r.id = ${vraag.roundId}
    `;
    const submitters = vraag.photoUploadId ? await loadSubmitters(quiz?.is_demo ? "test" : "live", [vraag.photoUploadId]) : {};
    const submitter = vraag.photoUploadId ? (submitters[vraag.photoUploadId]?.name ?? null) : null;
    const handmatig = new Set(vraag.subjects.map((name) => name.toLowerCase()));
    automatisch = subjectsOf({ ...vraag, subjects: [] }, submitter).filter((name) => !handmatig.has(name.toLowerCase()));
  }

  const [ronde] = await db()<{ number: number; title: string; is_demo: boolean }[]>`
    select r.number, r.title, z.is_demo from valk.quiz_rounds r join valk.quizzes z on z.id = r.quiz_id where r.id = ${rondeId}
  `;
  if (!ronde) notFound();

  // Echt of AI: the fun-fact photos the admin picked for the quiz (with the AI version or the real one).
  const keuzes = await db()<{ id: string; quiz_variant: "echt" | "ai"; naam: string | null; ai_id: string | null }[]>`
    select u.id, u.quiz_variant, coalesce(nullif(trim(p.nickname), ''), p.name) as naam,
      (select a.id from valk.uploads a where a.original_id = u.id and a.kind = 'ai' order by a.created_at desc limit 1) as ai_id
    from valk.uploads u
    left join valk.participants p on p.id = u.participant_id
    where u.kind = 'funfact' and u.quiz_variant is not null
    order by lower(coalesce(p.name, '')), u.created_at
  `;
  const fotoKeuzes: FotoKeuze[] = await Promise.all(
    keuzes.map(async (keuze) => {
      const ai = keuze.quiz_variant === "ai" && keuze.ai_id !== null;
      return {
        id: keuze.id,
        label: `${keuze.naam ?? "Iemand"}: ${ai ? "de AI-versie" : "de echte foto"}`,
        url: await signedPhotoUrl(ai ? keuze.ai_id! : keuze.id),
        goed: ai ? ("ai" as const) : ("echt" as const),
      };
    }),
  );
  const gekozen = fotoKeuzes.find((keuze) => keuze.id === waarden.foto);
  if (gekozen && waarden.soort === "echt_of_ai") waarden = { ...waarden, fotoUrl: gekozen.url, goedEcht: gekozen.goed };

  return (
    <>
      <BeheerKop
        titel={questionId ? "Vraag bewerken" : "Nieuwe vraag"}
        sub={`Ronde ${ronde.number}: ${ronde.title}${ronde.is_demo ? " (demo-quiz)" : ""}`}
        terug={{ href: `/beheer/quiz/ronde/${rondeId}`, label: `Ronde ${ronde.number}` }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}
      <div className="mt-5">
        <VraagEditor ronde={rondeId} id={questionId} begin={waarden} automatisch={automatisch} fotoKeuzes={fotoKeuzes} />
      </div>
    </>
  );
}
