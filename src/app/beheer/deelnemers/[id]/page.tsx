import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRequestContext } from "@/lib/server/context";
import { getParticipant } from "@/lib/server/participants";
import { requireAdmin } from "@/lib/server/session";
import { listTeams } from "@/lib/server/teams";
import { formatDayMonth, formatTime } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden, ProefMelding } from "../../onderdelen";
import { DeelnemerFormulier } from "./DeelnemerFormulier";

export const metadata: Metadata = { title: "Deelnemer" };

export default function DeelnemerPage({ params }: PageProps<"/beheer/deelnemers/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/deelnemers/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const ctx = await getRequestContext();
  const teams = await listTeams(ctx.env);
  const nieuw = id === "nieuw";
  const deelnemer = nieuw ? null : await getParticipant(ctx.env, id);
  if (!nieuw && !deelnemer) notFound();
  const gekozen = deelnemer?.claimedAt ? new Date(deelnemer.claimedAt) : null;

  return (
    <>
      <BeheerKop
        titel={deelnemer ? deelnemer.name : "Nieuwe deelnemer"}
        sub={
          deelnemer
            ? gekozen
              ? `Koos deze naam op ${formatDayMonth(gekozen)} om ${formatTime(gekozen)}.`
              : "Heeft deze naam nog niet gekozen in de app."
            : "Vul de gegevens in. Elke naam mag maar één keer voorkomen."
        }
        terug={{ href: "/beheer/deelnemers#deelnemers", label: "Deelnemers en teams" }}
      />
      {ctx.env === "test" ? <ProefMelding /> : null}
      <DeelnemerFormulier
        deelnemer={
          deelnemer
            ? {
                id: deelnemer.id,
                name: deelnemer.name,
                nickname: deelnemer.nickname ?? "",
                teamId: deelnemer.teamId ?? "",
                isChild: deelnemer.isChild,
                isCaptain: deelnemer.isCaptain,
                claimed: deelnemer.claimed,
              }
            : null
        }
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />
    </>
  );
}
