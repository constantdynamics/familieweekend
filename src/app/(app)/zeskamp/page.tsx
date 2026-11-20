import type { Metadata } from "next";
import { IconJoker, IconZeskamp } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Zeskamp" };

export default function ZeskampPage() {
  return (
    <Scherm>
      <SchermTitel sub="Zaterdag, de grote dag">Zeskamp</SchermTitel>
      <div className="mt-4">
        <LegeStaat icon={<IconZeskamp size={34} />} titel="Zes spellen, vier teams">
          <p className="m-0">
            Op zaterdag strijden de teams in zes spellen. De spelleiders klokken de tijden tot op de honderdste
            seconde.
          </p>
          <p className="m-0">Welke spellen het worden? Dat blijft nog even een verrassing.</p>
        </LegeStaat>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-[18px] bg-studio-licht px-4 py-3.5">
        <span className="mt-0.5 flex-none text-mosterd">
          <IconJoker size={24} />
        </span>
        <p className="m-0 text-[15px] leading-[1.4]">
          Elk team mag in de zeskamp één keer een joker inzetten. Bij dat spel tellen de punten dubbel.
        </p>
      </div>
    </Scherm>
  );
}
