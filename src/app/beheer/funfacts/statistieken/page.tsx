import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconPijlOmlaag, IconVinkje } from "@/components/ui/icons";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { listAllAnswers, listFunfactQuestions, listProgress, mainQuizRounds, type FunfactQuestion, type StoredAnswer } from "@/lib/server/funfacts";
import { requireAdmin } from "@/lib/server/session";
import { conceptQuestion, formatNumber, KIND_LABELS, questionStats, type ConceptResult, type QuestionStats } from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../onderdelen";
import { NeemOver } from "../onderdelen";

export const metadata: Metadata = { title: "Statistieken fun facts" };

export default function StatistiekenPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

const LETTERS = ["A", "B", "C", "D"];

function procent(value: number): string {
  return `${Math.round(value)}%`;
}

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  const [vragen, antwoorden, mensen, rondes] = await Promise.all([
    listFunfactQuestions(),
    listAllAnswers(ctx.env),
    listProgress(ctx.env),
    mainQuizRounds(),
  ]);
  const perVraag = new Map<string, (StoredAnswer & { participantId: string })[]>();
  for (const antwoord of antwoorden) {
    const lijst = perVraag.get(antwoord.questionId) ?? [];
    lijst.push(antwoord);
    perVraag.set(antwoord.questionId, lijst);
  }
  const naamVan = new Map(mensen.map((m) => [m.id, m.name]));
  const uit = ctx.env === "test" ? "In de proef zie je de conceptvragen van de testnamen. Overnemen in de echte quiz kan buiten de proef." : null;

  return (
    <>
      <BeheerKop
        titel="Statistieken"
        sub={bijElkaar("Per vraag: aantallen, percentages en uitschieters. Plus een conceptvraag voor de quiz, die je met één tik overneemt.")}
        terug={{ href: "/beheer/funfacts", label: "Fun facts" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}
      {antwoorden.length === 0 ? (
        <div className="mt-5">
          <Melding tone="info">Nog geen antwoorden. Zodra de familie invult, verschijnen hier de cijfers.</Melding>
        </div>
      ) : null}
      <div className="mt-5 flex flex-col gap-4">
        {vragen.map((vraag, index) => {
          const lijst = perVraag.get(vraag.id) ?? [];
          if (!vraag.active && lijst.length === 0) return null;
          return (
            <VraagStatistiek
              key={vraag.id}
              nummer={index + 1}
              vraag={vraag}
              stats={questionStats(vraag, lijst)}
              concept={conceptQuestion(vraag, lijst)}
              open={
                vraag.kind === "open"
                  ? lijst
                      .filter((a) => !a.skipped && a.value && "text" in a.value)
                      .map((a) => ({ naam: naamVan.get(a.participantId) ?? "Onbekend", tekst: (a.value as { text: string }).text }))
                      .sort((a, b) => a.naam.localeCompare(b.naam, "nl"))
                  : []
              }
              rondes={rondes}
              uit={uit}
            />
          );
        })}
      </div>
    </>
  );
}

function VraagStatistiek({
  nummer,
  vraag,
  stats,
  concept,
  open,
  rondes,
  uit,
}: {
  nummer: number;
  vraag: FunfactQuestion;
  stats: QuestionStats;
  concept: ConceptResult;
  open: { naam: string; tekst: string }[];
  rondes: { number: number; title: string; texts: string[] }[];
  uit: string | null;
}) {
  const titelId = `stat-${vraag.id}`;
  const alInRonde = concept.ok ? rondes.find((r) => r.texts.includes(concept.draft.text)) : undefined;
  return (
    <Kaart aria-labelledby={titelId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-label font-bold">
          Vraag {nummer} · {KIND_LABELS[vraag.kind]}
          {vraag.active ? "" : " · staat uit"}
        </p>
        <h2 id={titelId} className="m-0 text-[19px] leading-snug font-extrabold">
          {bijElkaar(vraag.text)}
        </h2>
        <p className="m-0 text-label">
          {stats.answered === 1 ? "1 antwoord" : `${stats.answered} antwoorden`}, {stats.skipped} overgeslagen
        </p>
      </div>

      {stats.rows.length > 0 && stats.answered > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {stats.rows.map((rij) => (
            <li key={rij.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-bold">
                  {rij.label}
                  {rij.outdated ? <span className="font-medium"> (oude optie)</span> : null}
                </span>
                <span className="flex-none text-[15px] cijfers">
                  {rij.count} · {procent(rij.percent)}
                </span>
              </div>
              <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pil bg-papier-streep">
                <div className="h-full rounded-pil bg-studio" style={{ width: `${Math.max(rij.percent, rij.count > 0 ? 2 : 0)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {stats.numbers ? (
        <dl className="m-0 grid grid-cols-2 gap-2">
          {[
            ["Gemiddeld", formatNumber(Math.round(stats.numbers.average * 10) / 10)],
            ["Samen", formatNumber(stats.numbers.sum)],
            ["Hoogste", formatNumber(stats.numbers.max)],
            ["Laagste", formatNumber(stats.numbers.min)],
          ].map(([label, waarde]) => (
            <div key={label} className="flex flex-col rounded-tegel bg-papier px-3 py-2">
              <dt className="text-label">{label}</dt>
              <dd className="m-0 text-[22px] leading-tight font-extrabold cijfers">{waarde}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {vraag.kind === "open" && open.length > 0 ? (
        <details className="group rounded-tegel bg-papier px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
            Lees de antwoorden
            <IconPijlOmlaag size={18} className="flex-none group-open:rotate-180" />
          </summary>
          <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0 pb-1">
            {open.map((antwoord, i) => (
              <li key={i} className="text-[15px] leading-[1.4]">
                <strong>{antwoord.naam}:</strong> {bijElkaar(antwoord.tekst)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {vraag.kind === "foto" ? (
        <Link href="/beheer/funfacts/fotos" className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-studio underline underline-offset-4">
          Naar de foto&apos;s voor Echt of AI
        </Link>
      ) : null}

      {vraag.kind === "ja_nee" || vraag.kind === "getal" || vraag.kind === "keuze" ? (
        <section aria-label={`Conceptvraag bij vraag ${nummer}`} className="flex flex-col gap-2.5 rounded-[18px] border-2 border-studio bg-papier p-3.5">
          <h3 className="m-0 text-[16px] font-extrabold">Conceptvraag voor de quiz</h3>
          {concept.ok ? (
            <>
              <p className="m-0 text-[16px] leading-snug font-bold">{bijElkaar(concept.draft.text)}</p>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {concept.draft.options.map((optie, i) => {
                  const goed = i === concept.draft.correct;
                  return (
                    <li
                      key={i}
                      className={`flex min-h-10 items-center gap-2.5 rounded-tegel px-3 py-1.5 text-[15px] ${
                        goed ? "bg-avocado-licht font-extrabold" : "bg-beeldbuis"
                      }`}
                    >
                      <span className="w-4 flex-none font-extrabold">{LETTERS[i]}</span>
                      <span className="flex-1">{optie}</span>
                      {goed ? (
                        <span className="flex flex-none items-center gap-1 text-label font-bold">
                          <IconVinkje size={16} />
                          goed
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <p className="m-0 text-label leading-[1.4]">{bijElkaar(`Uitleg bij de onthulling: ${concept.draft.explanation}`)}</p>
              {concept.draft.note ? <Melding tone="info">{concept.draft.note}</Melding> : null}
              {alInRonde ? (
                <p className="m-0 flex items-center gap-1.5 text-label font-bold">
                  <IconVinkje size={16} />
                  {bijElkaar(`Staat al in ronde ${alInRonde.number}: ${alInRonde.title}.`)}
                </p>
              ) : (
                <NeemOver id={vraag.id} rondes={rondes.map((r) => ({ number: r.number, title: r.title }))} uit={uit} />
              )}
            </>
          ) : (
            <p className="m-0 text-label leading-[1.4]">{bijElkaar(concept.reason)}</p>
          )}
        </section>
      ) : null}
    </Kaart>
  );
}
