import type { Metadata } from "next";
import { IconPrikbord } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Prikbord" };

/** Placeholder until the board is built (docs/PLAN-fase-2-4.md, onderdeel 4). */
export default function PrikbordPage() {
  return (
    <Scherm>
      <SchermTitel sub="Groeten, herinneringen en sterke verhalen">Prikbord</SchermTitel>
      <div className="mt-4">
        <LegeStaat icon={<IconPrikbord size={34} />} titel="Het prikbord komt eraan">
          <p className="m-0">Hier zet de familie straks berichten en foto&apos;s neer.</p>
        </LegeStaat>
      </div>
    </Scherm>
  );
}
