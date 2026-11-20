import type { Metadata } from "next";
import { Suspense } from "react";
import { KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";
import { listAudit, type AuditRow } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/session";
import { formatFull } from "@/lib/shared/time";
import { actieLabel } from "../labels";
import { BeheerKop, BeheerLaden } from "../onderdelen";

export const metadata: Metadata = { title: "Logboek" };

const PER_PAGINA = 40;

export default function LogboekPage({ searchParams }: PageProps<"/beheer/logboek">) {
  return (
    <Scherm metTabBalk={false}>
      <Suspense fallback={<BeheerLaden />}>
        <Inhoud searchParams={searchParams} />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/beheer/logboek">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const voor = Number(Array.isArray(params.voor) ? params.voor[0] : params.voor);
  const rows = await listAudit(PER_PAGINA + 1, Number.isInteger(voor) && voor > 0 ? voor : undefined);
  const page = rows.slice(0, PER_PAGINA);
  const meer = rows.length > PER_PAGINA;

  return (
    <>
      <BeheerKop
        titel="Logboek"
        sub="Alles wat in beheer gebeurt, met de oude en de nieuwe waarde. Nieuwste bovenaan."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {page.length === 0 ? (
        <p className="mt-6 mb-0 rounded-[18px] bg-studio-licht px-4 py-3.5 text-[15px] text-zand">
          Nog niets gebeurd. Zodra je iets wijzigt, staat het hier.
        </p>
      ) : (
        <ol className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0">
          {page.map((row) => (
            <Regel key={row.id} row={row} />
          ))}
        </ol>
      )}
      {meer ? (
        <KnopLink href={`/beheer/logboek?voor=${page.at(-1)!.id}`} variant="secundair" className="mt-5 self-start">
          Toon oudere regels
        </KnopLink>
      ) : null}
    </>
  );
}

function waarde(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatFull(new Date(value));
  return String(value);
}

function Regel({ row }: { row: AuditRow }) {
  const oud = (row.oldValue ?? {}) as Record<string, unknown>;
  const nieuw = (row.newValue ?? {}) as Record<string, unknown>;
  const keys = row.action === "instellingen.gewijzigd" ? Object.keys(nieuw) : [];
  return (
    <li className="op-licht flex flex-col gap-1 rounded-[18px] bg-beeldbuis px-4 py-3 text-studio">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[16px] font-extrabold">{actieLabel(row.action)}</span>
        <span className="text-klein">{formatFull(new Date(row.createdAt))}</span>
      </div>
      <span className="text-label">Door {row.actorName}</span>
      {keys.length > 0 ? (
        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-label leading-[1.4]">
          {keys.map((key) => (
            <li key={key}>
              <strong className="font-bold">{key}</strong>: {waarde(oud[key])} → {waarde(nieuw[key])}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
