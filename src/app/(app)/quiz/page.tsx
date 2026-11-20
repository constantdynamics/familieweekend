import type { Metadata } from "next";
import { AntwoordSymbool, IconQuiz } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Quiz" };

const TEGELS = [
  { kleur: "bg-oranje", naam: "Zon", soort: "zon" },
  { kleur: "bg-mosterd", naam: "Bloem", soort: "bloem" },
  { kleur: "bg-avocado-licht", naam: "Ster", soort: "ster" },
  { kleur: "bg-petrol-licht", naam: "Maan", soort: "maan" },
] as const;

export default function QuizPage() {
  return (
    <Scherm>
      <SchermTitel sub="Donderdagavond, de eerste avond van de Spelen">De quiz</SchermTitel>
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
    </Scherm>
  );
}
