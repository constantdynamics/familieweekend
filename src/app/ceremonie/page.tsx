import type { Metadata } from "next";
import { Suspense } from "react";
import { Embleem } from "@/components/brand/Embleem";
import { IconMedaille } from "@/components/ui/icons";
import { KnopLink } from "@/components/ui/Knop";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";
import { ceremonyViewFor } from "@/lib/server/ceremony";
import { getRequestContext } from "@/lib/server/context";
import { getSettings } from "@/lib/server/settings";
import { Ceremonie } from "./Ceremonie";

export const metadata: Metadata = { title: "Prijsuitreiking" };

/** Full screen, without the tab bar: every phone goes here when the ceremony starts. */
export default function CeremoniePage() {
  return (
    <Scherm stralen="feest" metTabBalk={false} boven={48}>
      <Suspense fallback={<Laden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

function Laden() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex items-center gap-3 pr-10">
        <Embleem size={72} />
        <p className="m-0 font-display text-[30px] leading-[1.1] schaduw-oranje">Prijsuitreiking</p>
      </div>
      <span className="sr-only">Laden…</span>
      <div className="h-56 rounded-kaart-groot bg-studio-licht" />
    </div>
  );
}

async function Inhoud() {
  const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
  if (!settings.fase2Live && !ctx.isAdmin) {
    return (
      <>
        <div className="flex items-center gap-3 pr-10">
          <Embleem size={72} />
          <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">Prijsuitreiking</h1>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <LegeStaat icon={<IconMedaille size={34} />} titel="Op zaterdagavond">
            <p className="m-0">Na het feestdiner gaan de plaatsen er één voor één af, met podium en medailles.</p>
          </LegeStaat>
          <KnopLink href="/" variant="secundair" className="self-start">
            Naar Thuis
          </KnopLink>
        </div>
      </>
    );
  }
  const admin = ctx.isAdmin && !ctx.viewAs;
  const view = await ceremonyViewFor(ctx.env, admin);
  return <Ceremonie initial={view} beheerder={admin} />;
}
