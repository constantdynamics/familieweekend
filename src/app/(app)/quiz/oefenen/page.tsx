import type { Metadata } from "next";
import { Suspense } from "react";
import { Oefenen } from "@/components/quiz/Oefenen";
import { IconSpelen } from "@/components/ui/icons";
import { Chip, Kaart, SchermTitel } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { magOefenen, oefenOverzicht, oefenPlan, oefenViewVoor } from "@/lib/server/quiz/oefenen";
import { bijElkaar } from "@/lib/shared/tekst";

export const metadata: Metadata = { title: "Quiz oefenen" };

/**
 * Practising the quiz: the beheerder and spelleiders play a question, a
 * round or the whole quiz alone, as a captain. Under /quiz, so the service
 * worker never keeps a copy; the questions and answers only come for them.
 */
export default function OefenPage({ searchParams }: PageProps<"/quiz/oefenen">) {
  return (
    <Scherm>
      <Suspense fallback={<Laden />}>
        <Inhoud searchParams={searchParams} />
      </Suspense>
    </Scherm>
  );
}

function een(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/quiz/oefenen">["searchParams"] }) {
  const ctx = await getRequestContext();
  if (!magOefenen(ctx)) return <Geweigerd />;
  const query = await searchParams;
  const keuze = { vraag: een(query.vraag), ronde: een(query.ronde), quiz: een(query.quiz) };
  if (!keuze.vraag && !keuze.ronde && !keuze.quiz) return <Overzicht isAdmin={ctx.isAdmin} />;
  const plan = await oefenPlan(keuze, ctx.isAdmin);
  const eerste = plan?.stappen[0];
  const view = plan && eerste ? await oefenViewVoor(ctx, plan.quizId, eerste, eerste.vraag ? "open" : "rondescherm", null) : null;
  if (!plan || !eerste || !view) return <NietGevonden isAdmin={ctx.isAdmin} />;
  return <Oefenen quizId={plan.quizId} stappen={plan.stappen} eerste={view} terug={plan.terug} />;
}

async function Overzicht({ isAdmin }: { isAdmin: boolean }) {
  const quizzes = await oefenOverzicht();
  return (
    <>
      <SchermTitel chip={<Chip>{isAdmin ? "Beheerder" : "Spelleider"}</Chip>} sub="Speel de quiz alleen, zoals een captain hem ziet. Er wordt niets bewaard.">
        Quiz oefenen
      </SchermTitel>
      {quizzes.length === 0 ? (
        <p className="m-0 mt-5 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.45]">{bijElkaar("Er staan nog geen vragen klaar.")}</p>
      ) : (
        quizzes.map((quiz) => (
          <section key={quiz.id} aria-labelledby={`quiz-${quiz.id}`} className="mt-6 flex flex-col gap-3">
            <h2 id={`quiz-${quiz.id}`} className="m-0 font-display text-[24px] leading-tight font-normal schaduw-oranje">
              {bijElkaar(quiz.isDemo ? `${quiz.title} (demo)` : quiz.title)}
            </h2>
            <KnopLink href={`/quiz/oefenen?quiz=${quiz.id}`} className="self-start">
              <IconSpelen size={20} />
              Speel de hele quiz
            </KnopLink>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {quiz.rondes.map((ronde) => (
                <li key={ronde.id}>
                  <Kaart className="flex flex-col gap-2">
                    <span className="text-[17px] leading-[1.3] font-extrabold">{bijElkaar(`Ronde ${ronde.number}: ${ronde.title}`)}</span>
                    <span className="text-[15px]">{`${ronde.vragen} ${ronde.vragen === 1 ? "vraag" : "vragen"}`}</span>
                    <KnopLink href={`/quiz/oefenen?ronde=${ronde.id}`} size="klein" variant="secundair-licht" className="self-start">
                      <IconSpelen size={18} />
                      {`Speel ronde ${ronde.number}`}
                    </KnopLink>
                  </Kaart>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <KnopLink href={isAdmin ? "/beheer/quiz" : "/spelleider"} variant="secundair" className="mt-7 self-start">
        {isAdmin ? "Naar beheer, quiz" : "Terug naar de spelleiding"}
      </KnopLink>
    </>
  );
}

function Geweigerd() {
  return (
    <>
      <SchermTitel sub="Speel de quiz alleen, zoals een captain hem ziet.">Quiz oefenen</SchermTitel>
      <Kaart className="mt-5 flex flex-col gap-3">
        <p className="m-0 text-[16px] leading-[1.45]">
          {bijElkaar("Oefenen is voor de beheerder en de spelleiders: zij zien alle vragen en antwoorden. Log eerst in voor de spelleiding.")}
        </p>
        <KnopLink href="/spelleider" className="self-start">
          Inloggen voor de spelleiding
        </KnopLink>
      </Kaart>
    </>
  );
}

function NietGevonden({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <SchermTitel sub="Speel de quiz alleen, zoals een captain hem ziet.">Quiz oefenen</SchermTitel>
      <Kaart className="mt-5 flex flex-col gap-3">
        <p className="m-0 text-[16px] leading-[1.45]">{bijElkaar("Hier staan geen vragen in, of deze vraag of ronde bestaat niet meer.")}</p>
        <KnopLink href={isAdmin ? "/beheer/quiz" : "/quiz/oefenen"} className="self-start">
          {isAdmin ? "Naar beheer, quiz" : "Naar oefenen"}
        </KnopLink>
      </Kaart>
    </>
  );
}

function Laden() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Oefenen laden…</span>
      <div className="h-9 w-40 rounded-tegel bg-studio-licht" />
      <div className="h-56 rounded-kaart bg-studio-licht" />
    </div>
  );
}
