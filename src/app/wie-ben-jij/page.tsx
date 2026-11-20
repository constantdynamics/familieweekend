import type { Metadata } from "next";
import { Suspense } from "react";
import { Scherm } from "@/components/ui/Scherm";
import { SchermTitel } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { listParticipants } from "@/lib/server/participants";
import { safeReturnPath } from "@/lib/shared/paths";
import { NaamKiezer } from "./NaamKiezer";

export const metadata: Metadata = { title: "Wie ben jij?" };

/** "Kies je naam" (SPEC §3): after the family code, once per device. */
export default function WieBenJijPage({ searchParams }: PageProps<"/wie-ben-jij">) {
  return (
    <Scherm metTabBalk={false} boven={52}>
      <SchermTitel sub="Kies je naam uit de lijst. Dan weet de app wie er post, en kun je je fun facts invullen.">
        Wie ben jij?
      </SchermTitel>
      <Suspense fallback={<div className="mt-6 h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Lijst searchParams={searchParams} />
      </Suspense>
    </Scherm>
  );
}

async function Lijst({ searchParams }: { searchParams: PageProps<"/wie-ben-jij">["searchParams"] }) {
  const ctx = await getRequestContext();
  const params = await searchParams;
  const terug = safeReturnPath(typeof params.terug === "string" ? params.terug : "/");
  const deelnemers = await listParticipants(ctx.env);
  const mijn = new Set(ctx.names.map((n) => n.id));
  return (
    <NaamKiezer
      terug={terug}
      namen={deelnemers.map((d) => ({
        id: d.id,
        naam: d.name,
        roepnaam: d.nickname,
        status: mijn.has(d.id) ? "van-jou" : d.claimed ? "bezet" : "vrij",
      }))}
    />
  );
}
