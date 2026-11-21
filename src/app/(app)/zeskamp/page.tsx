import type { Metadata } from "next";
import { Suspense } from "react";
import { IconJoker, IconZeskamp } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";
import { canActAsCaptain, getRequestContext } from "@/lib/server/context";
import { seesEverything } from "@/lib/server/scoreboard";
import { getSettings } from "@/lib/server/settings";
import { zeskampViewFor } from "@/lib/server/zeskamp";
import { ZeskampOverzicht } from "./ZeskampOverzicht";

export const metadata: Metadata = { title: "Zeskamp" };

export default function ZeskampPage() {
  return (
    <Scherm>
      <Suspense fallback={<Laden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

function Laden() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <SchermTitel sub="Zaterdag, de grote dag">Zeskamp</SchermTitel>
      <span className="sr-only">Zeskamp laden…</span>
      {[0, 1, 2].map((rij) => (
        <div key={rij} className="h-28 rounded-kaart bg-studio-licht" />
      ))}
    </div>
  );
}

async function Inhoud() {
  const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
  if (!settings.fase2Live && !ctx.isAdmin) return <NogNiet />;
  const view = await zeskampViewFor(ctx.env, {
    admin: await seesEverything(ctx),
    ownTeamId: ctx.ownTeamId,
    captain: canActAsCaptain(ctx),
  });
  return <ZeskampOverzicht initial={view} />;
}

function NogNiet() {
  return (
    <>
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
    </>
  );
}
