import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import { SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { programView } from "@/lib/server/program";
import { getSettings, SETTINGS_TAG } from "@/lib/server/settings";
import { formatDateRangePlain } from "@/lib/shared/time";
import { ProgrammaWeergave } from "./ProgrammaWeergave";

export const metadata: Metadata = { title: "Programma" };

/**
 * Programma (SPEC §4.3). The title is part of the static shell; the program
 * itself depends on who looks (the admin always sees it, the family once it
 * is released) and stays live through the doorbell.
 */
export default function ProgrammaPage() {
  return (
    <Scherm>
      <Kop />
      <Suspense fallback={<Laden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Kop() {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("days");
  const settings = await getSettings();
  const range = formatDateRangePlain(new Date(settings.startAt), new Date(settings.endAt));
  return <SchermTitel sub={`Hemelvaart, ${range}`}>Programma</SchermTitel>;
}

/** The moment of this request; the phone's clock takes over after the first paint. */
function renderMoment(): number {
  return Date.now();
}

async function Inhoud() {
  await connection();
  const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
  const view = await programView(ctx, settings);
  return <ProgrammaWeergave initial={view} isAdmin={ctx.isAdmin} renderedAt={renderMoment()} />;
}

function Laden() {
  return (
    <div aria-busy="true" className="mt-4 flex flex-col gap-3">
      <span className="sr-only">Programma laden…</span>
      <div className="h-14 rounded-[16px] bg-studio-licht" />
      <div className="h-40 rounded-kaart bg-studio-licht" />
    </div>
  );
}
