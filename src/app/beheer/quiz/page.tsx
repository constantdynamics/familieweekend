import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SOORT_LABEL } from "@/components/quiz/soorten";
import { IconDownload, IconLuister, IconPijlVerder, IconQuiz } from "@/components/ui/icons";
import { IconWeegschaal } from "@/components/ui/icons-quiz";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { getRequestContext } from "@/lib/server/context";
import { shortTeamName } from "@/lib/server/quiz/fairness";
import { quizOverview } from "@/lib/server/quiz/overzicht";
import { findDemoQuizId } from "@/lib/server/quiz/store";
import { requireAdmin } from "@/lib/server/session";
import { bijElkaar } from "@/lib/shared/tekst";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { MaakQuiz, QuizImport } from "./onderdelen";

export const metadata: Metadata = { title: "Quiz" };

export default function QuizBeheerPage({ searchParams }: PageProps<"/beheer/quiz">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud searchParams={searchParams} />
    </Suspense>
  );
}

function punten(aantal: number): string {
  return `${aantal} ${aantal === 1 ? "punt" : "punten"}`;
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/beheer/quiz">["searchParams"] }) {
  await requireAdmin();
  const ctx = await getRequestContext();
  const params = await searchParams;
  const demo = params.quiz === "demo";
  const [overview, demoId] = await Promise.all([quizOverview(demo ? "demo" : "hoofd"), findDemoQuizId()]);
  const vragen = overview ? overview.content.rounds.reduce((sum, round) => sum + round.questions.length, 0) : 0;

  return (
    <>
      <BeheerKop
        titel="Quiz"
        sub={
          overview
            ? `${overview.content.title}: ${overview.content.rounds.length} rondes, ${vragen} ${vragen === 1 ? "vraag" : "vragen"}.`
            : "Er is nog geen quiz."
        }
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}

      <Kaart className="mt-5 flex flex-col gap-3">
        <h2 className="m-0 flex items-center gap-2.5 text-[20px] font-extrabold">
          <IconQuiz size={24} />
          Quizmaster-console
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar(
            "Hier bedien je de quiz op de avond zelf: vragen tonen, sluiten en onthullen, de luistermodus, correcties en de tussenstand.",
          )}
        </p>
        <KnopLink href="/beheer/quiz/console" className="self-start">
          Open de console
        </KnopLink>
      </Kaart>

      {demoId ? (
        <nav aria-label="Welke quiz" className="mt-5 flex flex-wrap gap-2">
          {[
            { href: "/beheer/quiz", label: "De echte quiz", actief: !demo },
            { href: "/beheer/quiz?quiz=demo", label: "Demo-quiz voor de proef", actief: demo },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.actief ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-pil px-4 text-[15px] font-bold no-underline ${
                tab.actief ? "bg-mosterd text-studio hover:text-studio" : "bg-studio-licht text-beeldbuis hover:text-beeldbuis"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {!overview ? (
        <Kaart className="mt-5 flex flex-col gap-3">
          <h2 className="m-0 text-[20px] font-extrabold">{demo ? "Er is nog geen demo-quiz" : "Begin met de quiz"}</h2>
          <p className="m-0 text-[15px] leading-[1.45]">
            {bijElkaar(
              demo
                ? "De demo-quiz komt er vanzelf bij als je de proef klaarzet (Beheer, Proefmodus)."
                : "Maak de vijf rondes uit de SPEC en vul ze met de vraageditor, of lees meteen een quizbestand in.",
            )}
          </p>
          {demo ? null : <MaakQuiz />}
        </Kaart>
      ) : (
        <>
          <Waarschuwingen overview={overview} />
          <section aria-labelledby="rondes-titel" className="mt-6 flex flex-col gap-3">
            <h2 id="rondes-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
              Rondes
            </h2>
            {overview.content.rounds.map((round) => (
              <Link
                key={round.id}
                href={`/beheer/quiz/ronde/${round.id}`}
                className="op-licht flex items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio"
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd font-display text-[22px] leading-none">
                  {round.number}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(round.title)}</span>
                  <span className="text-label leading-[1.35]">
                    {bijElkaar(
                      [
                        `${round.questions.length} ${round.questions.length === 1 ? "vraag" : "vragen"}`,
                        `maximaal ${punten(overview.maxPerRound[round.number] ?? 0)}`,
                        round.listening ? "luistermodus" : null,
                        round.intermezzoAfter ? "daarna het intermezzo" : null,
                      ]
                        .filter(Boolean)
                        .join(", "),
                    )}
                  </span>
                  {round.questions.length > 0 ? (
                    <span className="text-label leading-[1.35]">
                      {bijElkaar([...new Set(round.questions.map((q) => SOORT_LABEL[q.kind].toLowerCase()))].join(", "))}
                    </span>
                  ) : null}
                </span>
                {round.listening ? <IconLuister size={20} className="flex-none" /> : null}
                <IconPijlVerder size={20} className="flex-none" />
              </Link>
            ))}
          </section>

          <section aria-labelledby="eerlijk-titel" className="mt-6 flex flex-col gap-3">
            <h2 id="eerlijk-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
              Eerlijkheidscheck
            </h2>
            <Kaart className="flex flex-col gap-2.5">
              <p className="m-0 flex items-start gap-2.5 text-[16px] leading-[1.45] font-bold">
                <IconWeegschaal size={22} className="mt-0.5 flex-none" />
                <span>{bijElkaar(`${overview.fairness.line} (hele quiz).`)}</span>
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px] leading-[1.4]">
                {overview.fairness.rounds.map((round) => (
                  <li key={round.round}>{bijElkaar(`Ronde ${round.round}: ${overview.fairness.roundLines[round.round].replace("Voorkennis per team: ", "")}`)}</li>
                ))}
              </ul>
              <p className="m-0 text-label leading-[1.4]">
                {bijElkaar(
                  "Een vraag over één persoon (wie van ons, Echt of AI, of iemand bij onderwerp) geeft dat team voorkennis. Een verschil van meer dan 1 tussen teams geeft een waarschuwing.",
                )}
              </p>
            </Kaart>
          </section>
        </>
      )}

      {!demo ? (
        <section aria-labelledby="bestand-titel" className="mt-6 flex flex-col gap-3">
          <h2 id="bestand-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
            Importeren en exporteren
          </h2>
          <QuizImport />
          {overview ? (
            <a
              href="/api/quiz/export"
              className="inline-flex min-h-11 items-center gap-2 self-start text-[16px] font-bold text-mosterd underline underline-offset-4"
            >
              <IconDownload size={20} />
              Download de quiz als JSON (backup)
            </a>
          ) : null}
        </section>
      ) : overview ? (
        <a
          href="/api/quiz/export?quiz=demo"
          className="mt-6 inline-flex min-h-11 items-center gap-2 self-start text-[16px] font-bold text-mosterd underline underline-offset-4"
        >
          <IconDownload size={20} />
          Download de demo-quiz als JSON
        </a>
      ) : null}
    </>
  );
}

function Waarschuwingen({ overview }: { overview: NonNullable<Awaited<ReturnType<typeof quizOverview>>> }) {
  const lijst: string[] = [];
  for (const heavy of overview.heavy) {
    lijst.push(
      `Ronde ${heavy.round} (${heavy.title}) kan ${punten(heavy.max)} opleveren, de andere rondes hoogstens ${punten(heavy.othersMax)}. Een kaartvraag is tot 3 punten waard, dus deze ronde telt zwaarder.`,
    );
  }
  const naam = (id: string) => shortTeamName(overview.teams.find((team) => team.id === id)?.name ?? "?");
  for (const warning of overview.fairness.warnings) {
    const waar = warning.round === null ? "In de hele quiz" : `In ronde ${warning.round}`;
    lijst.push(
      `${waar} is de voorkennis scheef verdeeld: ${warning.most.map(naam).join(" en ")} ${warning.most.length === 1 ? "heeft" : "hebben"} ${warning.difference} vragen meer dan ${warning.least.map(naam).join(" en ")}.`,
    );
  }
  if (overview.fairness.unknownSubjects.length > 0) {
    lijst.push(`Niet in de deelnemerslijst: ${overview.fairness.unknownSubjects.join(", ")}. Kijk of de namen goed gespeld zijn.`);
  }
  if (lijst.length === 0) return null;
  return (
    <div className="mt-5 flex flex-col gap-2">
      {lijst.map((tekst) => (
        <Melding key={tekst} tone="info">
          {bijElkaar(tekst)}
        </Melding>
      ))}
    </div>
  );
}
