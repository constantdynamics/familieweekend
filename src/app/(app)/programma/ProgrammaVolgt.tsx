import { IconBloem, IconProgramma } from "@/components/ui/icons";
import { LegeStaat } from "@/components/ui/LegeStaat";

const HOOGTEPUNTEN = [
  { dag: "do", wanneer: "'s Avonds", titel: "De Grote Valkenburger Quiz", sub: "Vijf rondes van tien vragen, met een intermezzo" },
  { dag: "vr", wanneer: "'s Middags", titel: "Spelletjesmiddag", sub: "Telt mee voor de Spelen" },
  { dag: "za", wanneer: "De hele dag", titel: "Zeskamp", sub: "Zes spellen op het grasveld" },
  { dag: "za", wanneer: "'s Avonds", titel: "Prijsuitreiking", sub: "Wie wint De Valkenburger Spelen?" },
  { dag: "zo", wanneer: "'s Ochtends", titel: "Moederdagontbijt", sub: "Alle moeders blijven lekker zitten", moederdag: true },
];

/** Until the admin releases the program: the friendly empty state of phase 1, unchanged. */
export function ProgrammaVolgt() {
  return (
    <>
      <div className="mt-4">
        <LegeStaat icon={<IconProgramma size={34} />} titel="Het programma volgt">
          <p className="m-0">
            In het voorjaar staat hier het hele programma, met tijden en plekken. Tijdens het weekend zie je hier
            ook wat er nu bezig is.
          </p>
        </LegeStaat>
      </div>

      <h2 className="mt-7 mb-2 text-[15px] font-bold text-zand">Dit staat al vast</h2>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {HOOGTEPUNTEN.map((item) => (
          <li
            key={item.titel}
            className={`grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-3 rounded-[18px] px-3.5 py-3 ${
              item.moederdag ? "bg-studio-licht" : ""
            }`}
          >
            <span className="font-display text-[22px] leading-[1.1] text-mosterd">{item.dag}</span>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {item.moederdag ? <IconBloem size={20} /> : null}
                <span className="text-[17px] leading-tight font-bold">{item.titel}</span>
              </div>
              <span className="text-label text-zand">
                {item.wanneer}. {item.sub}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
