import type { Metadata } from "next";
import { IconScore, IconSlot } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Scorebord" };

const MEDAILLES = [
  { kleur: "bg-goud", naam: "goud", plaats: "1" },
  { kleur: "bg-zilver", naam: "zilver", plaats: "2" },
  { kleur: "bg-brons", naam: "brons", plaats: "3" },
];

export default function ScorePage() {
  return (
    <Scherm>
      <SchermTitel sub="Eén klassement over het hele weekend">Scorebord</SchermTitel>
      <div className="mt-4">
        <LegeStaat icon={<IconScore size={34} />} titel="Nog geen punten">
          <p className="m-0">
            Het scorebord gaat open zodra de quiz begint. Elk onderdeel telt mee: de quiz, de spelletjesmiddag en
            de zeskamp.
          </p>
          <p className="m-0">Per onderdeel zijn er medailles, zoals bij de Olympische Spelen.</p>
        </LegeStaat>
      </div>
      <div aria-hidden="true" className="mt-5 flex gap-2.5">
        {MEDAILLES.map((medaille) => (
          <span
            key={medaille.naam}
            className={`flex h-11 w-11 items-center justify-center rounded-pil ${medaille.kleur} text-[17px] font-extrabold text-studio`}
          >
            {medaille.plaats}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-[18px] bg-studio-licht px-4 py-3.5">
        <span className="mt-0.5 flex-none text-mosterd">
          <IconSlot size={24} />
        </span>
        <p className="m-0 text-[15px] leading-[1.4]">
          Vanaf de start van de zeskamp gaat het scorebord op slot, tot de prijsuitreiking. Spannend tot het
          eind.
        </p>
      </div>
    </Scherm>
  );
}
