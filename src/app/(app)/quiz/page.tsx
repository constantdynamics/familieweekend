import type { Metadata } from "next";
import { Suspense } from "react";
import { QuizScherm } from "@/components/quiz/QuizScherm";
import { AntwoordSymbool, IconQuiz } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { quizOpenFor } from "@/lib/server/quiz/http";
import { quizViewFor } from "@/lib/server/quiz/store";

export const metadata: Metadata = { title: "Quiz" };

const TEGELS = [
  { kleur: "bg-oranje", naam: "Zon", soort: "zon" },
  { kleur: "bg-mosterd", naam: "Bloem", soort: "bloem" },
  { kleur: "bg-avocado-licht", naam: "Ster", soort: "ster" },
  { kleur: "bg-petrol-licht", naam: "Maan", soort: "maan" },
] as const;

/**
 * The quiz (SPEC §4.6). While it runs, it takes over the whole screen on
 * every phone; before and after, this is the story of the quiz. The
 * question itself never comes with the page before it opens: the screen
 * fetches its own role-aware state from /api/quiz/state.
 */
export default function QuizPage() {
  return (
    <Scherm>
      <Suspense fallback={<Laden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  const ctx = await getRequestContext();
  // The family sees the new quiz once the owner releases it; the admin sees it already.
  if (!(await quizOpenFor(ctx))) {
    return (
      <>
        <Kop />
        <NogNiet />
      </>
    );
  }
  const view = await quizViewFor(ctx);
  return (
    <QuizScherm initial={view} kop={<Kop />}>
      <NogNiet />
    </QuizScherm>
  );
}

function Kop() {
  return <SchermTitel sub="Donderdagavond, de eerste avond van de Spelen">De quiz</SchermTitel>;
}

function Laden() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">De quiz laden…</span>
      <div className="h-9 w-40 rounded-tegel bg-studio-licht" />
      <div className="h-56 rounded-kaart bg-studio-licht" />
    </div>
  );
}

function NogNiet() {
  return (
    <>
      <div className="mt-4">
        <LegeStaat
          icon={<IconQuiz size={34} />}
          titel="De Grote Valkenburger Quiz"
          voetnoot="Tip: vul in januari je fun facts in. Dan zit jij straks ook in de quiz."
        >
          <p className="m-0">
            Vijf rondes van tien vragen, met een intermezzo steen, papier, schaar. Je speelt mee op je telefoon,
            samen met je team.
          </p>
          <p className="m-0">Alleen de captain tikt het antwoord in. De rest overlegt mee, hoe harder hoe beter.</p>
        </LegeStaat>
      </div>
      <h2 className="mt-7 mb-2 text-[15px] font-bold text-zand">Zo zien de antwoorden eruit</h2>
      <ul className="m-0 grid list-none grid-cols-4 gap-2.5 p-0">
        {TEGELS.map((tegel) => (
          <li
            key={tegel.naam}
            className={`flex h-[76px] flex-col items-center justify-center gap-1 rounded-tegel ${tegel.kleur} text-label font-extrabold text-studio shadow-tegel`}
          >
            <AntwoordSymbool soort={tegel.soort} />
            {tegel.naam}
          </li>
        ))}
      </ul>
      <p className="mt-3 mb-0 text-label text-zand">Elke tegel heeft een kleur én een teken. Iedereen kan roepen: neem de ster!</p>
    </>
  );
}
