import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRequestContext } from "@/lib/server/context";
import { getFunfactQuestion, hasAnswers } from "@/lib/server/funfacts";
import { requireAdmin } from "@/lib/server/session";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../../onderdelen";
import { VerwijderVraag, VraagFormulier } from "../../onderdelen";

export const metadata: Metadata = { title: "Fun-factsvraag" };

export default function VraagPage({ params }: PageProps<"/beheer/funfacts/vragen/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/funfacts/vragen/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const ctx = await getRequestContext();
  const nieuw = id === "nieuw";
  const vraag = nieuw ? null : await getFunfactQuestion(id);
  if (!nieuw && !vraag) notFound();
  const beantwoord = vraag ? await hasAnswers(vraag.id) : false;

  return (
    <>
      <BeheerKop
        titel={vraag ? "Vraag wijzigen" : "Nieuwe vraag"}
        sub={vraag ? "Wat je hier bewaart, ziet de familie meteen." : "Hij komt achteraan in de lijst. De volgorde wijzig je daarna met de pijltjes."}
        terug={{ href: "/beheer/funfacts#vragen", label: "Fun facts" }}
      />
      {ctx.env === "test" ? (
        <>
          <ProefMelding />
          <p className="m-0 mt-3 text-[15px] leading-[1.45] text-zand">
            De vragen zijn voor de proef en het echte weekend hetzelfde. Verlaat eerst de proef om ze te wijzigen.
          </p>
        </>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <VraagFormulier
            vraag={{
              id: vraag?.id ?? null,
              kind: vraag?.kind ?? "ja_nee",
              text: vraag?.text ?? "",
              hint: vraag?.hint ?? "",
              options: (vraag?.options ?? []).join("\n"),
              min: vraag?.min === null || vraag?.min === undefined ? "0" : String(vraag.min),
              max: vraag?.max === null || vraag?.max === undefined ? "100" : String(vraag.max),
              quizForm: vraag?.quizForm ?? "",
              active: vraag?.active ?? true,
              heeftAntwoorden: beantwoord,
            }}
          />
          {vraag ? <VerwijderVraag id={vraag.id} heeftAntwoorden={beantwoord} /> : null}
        </div>
      )}
    </>
  );
}
