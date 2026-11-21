import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SOORT_LABEL } from "@/components/quiz/soorten";
import { IconFoto, IconMuzieknoot, IconPijlOmhoog, IconPijlOmlaag, IconPotlood } from "@/components/ui/icons";
import { IconWeegschaal } from "@/components/ui/icons-quiz";
import { KnopLink } from "@/components/ui/Knop";
import { getRequestContext } from "@/lib/server/context";
import { subjectsOf } from "@/lib/server/quiz/fairness";
import { correctLabel } from "@/lib/server/quiz/labels";
import { quizOverview } from "@/lib/server/quiz/overzicht";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";
import { isUuid } from "@/lib/server/teams";
import { bijElkaar } from "@/lib/shared/tekst";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../../onderdelen";
import { verplaatsVraag } from "../../actions";
import { RondeFormulier } from "./RondeFormulier";

export const metadata: Metadata = { title: "Quizronde" };

export default function RondePage({ params }: PageProps<"/beheer/quiz/ronde/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/quiz/ronde/[id]">["params"] }) {
  await requireAdmin();
  const ctx = await getRequestContext();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [row] = await db()<{ is_demo: boolean }[]>`
    select z.is_demo from valk.quiz_rounds r join valk.quizzes z on z.id = r.quiz_id where r.id = ${id}
  `;
  if (!row) notFound();
  const overview = await quizOverview(row.is_demo ? "demo" : "hoofd");
  const ronde = overview?.content.rounds.find((round) => round.id === id);
  if (!overview || !ronde) notFound();
  const terug = row.is_demo ? "/beheer/quiz?quiz=demo" : "/beheer/quiz";

  return (
    <>
      <BeheerKop
        titel={`Ronde ${ronde.number}`}
        sub={`${/[.!?…]$/.test(ronde.title) ? ronde.title : `${ronde.title}.`} Maximaal ${overview.maxPerRound[ronde.number] ?? 0} punten.`}
        terug={{ href: terug, label: "Quiz" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}
      <div className="mt-5 flex flex-col gap-4">
        <RondeFormulier
          ronde={{ id: ronde.id, title: ronde.title, intro: ronde.intro, listening: ronde.listening, intermezzoAfter: ronde.intermezzoAfter }}
        />
        {overview.fairness.roundLines[ronde.number] ? (
          <p className="m-0 flex items-start gap-2.5 text-[15px] leading-[1.4] text-zand">
            <IconWeegschaal size={20} className="mt-0.5 flex-none text-avocado-licht" />
            <span>{bijElkaar(`${overview.fairness.roundLines[ronde.number]}.`)}</span>
          </p>
        ) : null}

        <section aria-labelledby="vragen-titel" className="flex flex-col gap-3">
          <h2 id="vragen-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
            Vragen
          </h2>
          {ronde.questions.length === 0 ? (
            <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
              {bijElkaar("Nog geen vragen in deze ronde. Voeg er een toe, of lees een quizbestand in.")}
            </p>
          ) : null}
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {ronde.questions.map((vraag, index) => {
              const voorkennis = subjectsOf(vraag, vraag.photoUploadId ? (overview.submitters[vraag.photoUploadId]?.split(",")[0] ?? null) : null);
              return (
                <li key={vraag.id} id={`vraag-${vraag.id}`} className="op-licht flex scroll-mt-4 flex-col gap-2 rounded-kaart bg-beeldbuis p-4 text-studio shadow-kaart">
                  <span className="text-label font-bold">{bijElkaar(`Vraag ${index + 1}, ${SOORT_LABEL[vraag.kind].toLowerCase()}`)}</span>
                  <span className="text-[17px] leading-[1.3] font-extrabold">{bijElkaar(vraag.text)}</span>
                  <span className="text-[15px] leading-[1.4]">{bijElkaar(`Goed: ${correctLabel(vraag)}`)}</span>
                  {vraag.note ? (
                    <span className="flex items-start gap-2 text-[14px] leading-[1.35]">
                      <IconMuzieknoot size={18} className="mt-0.5 flex-none" />
                      <span>{bijElkaar(vraag.note)}</span>
                    </span>
                  ) : null}
                  {vraag.photoUploadId ? (
                    <span className="flex items-center gap-2 text-[14px]">
                      <IconFoto size={18} />
                      Met foto
                    </span>
                  ) : null}
                  {voorkennis.length > 0 ? <span className="text-[14px] leading-[1.35]">{bijElkaar(`Voorkennis: ${voorkennis.join(", ")}`)}</span> : null}
                  <span className="text-[14px] leading-[1.35] font-semibold">Kan een kind van 10 dit beredeneren?</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <KnopLink href={`/beheer/quiz/vraag/${vraag.id}`} size="klein" variant="secundair-licht">
                      <IconPotlood size={18} />
                      Bewerk
                    </KnopLink>
                    <form action={verplaatsVraag}>
                      <input type="hidden" name="id" value={vraag.id} />
                      <input type="hidden" name="richting" value="omhoog" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label={`Zet vraag ${index + 1} een plek hoger`}
                        className="flex h-11 w-11 items-center justify-center rounded-pil border-2 border-studio disabled:opacity-40"
                      >
                        <IconPijlOmhoog size={20} />
                      </button>
                    </form>
                    <form action={verplaatsVraag}>
                      <input type="hidden" name="id" value={vraag.id} />
                      <input type="hidden" name="richting" value="omlaag" />
                      <button
                        type="submit"
                        disabled={index === ronde.questions.length - 1}
                        aria-label={`Zet vraag ${index + 1} een plek lager`}
                        className="flex h-11 w-11 items-center justify-center rounded-pil border-2 border-studio disabled:opacity-40"
                      >
                        <IconPijlOmlaag size={20} />
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
          <KnopLink href={`/beheer/quiz/vraag/nieuw?ronde=${ronde.id}`} className="self-start">
            Voeg een vraag toe
          </KnopLink>
          <Link href={terug} className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4">
            Terug naar alle rondes
          </Link>
        </section>
      </div>
    </>
  );
}
