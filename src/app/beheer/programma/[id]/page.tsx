import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProgramItem, listProgram } from "@/lib/server/program";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { dayKey, programDays } from "@/lib/shared/program";
import { toAmsterdamInput } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden } from "../../onderdelen";
import { FormulierKaart, ProgrammaFormulier, VerwijderOnderdeel } from "../onderdelen";

export const metadata: Metadata = { title: "Onderdeel wijzigen" };

export default function OnderdeelPage({ params }: PageProps<"/beheer/programma/[id]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/programma/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const [item, settings, items] = await Promise.all([getProgramItem(id), readSettings(), listProgram()]);
  if (!item) notFound();
  const start = toAmsterdamInput(new Date(item.startsAt));
  const end = item.endsAt ? toAmsterdamInput(new Date(item.endsAt)) : null;
  const dag = dayKey(item.startsAt);
  const days = programDays(items, settings.startAt, settings.endAt);

  return (
    <>
      <BeheerKop
        titel="Onderdeel wijzigen"
        sub="Bewaren zet de wijziging meteen op alle telefoons."
        terug={{ href: `/beheer/programma#dag-${dag}`, label: "Programma" }}
      />
      <div className="mt-5 flex flex-col gap-4">
        <FormulierKaart titel={item.title}>
          <ProgrammaFormulier
            id={item.id}
            beginwaarden={{
              dag: start.date,
              begin: start.time,
              eind: end?.time ?? "",
              titel: item.title,
              ondertitel: item.subtitle ?? "",
              plek: item.location ?? "",
              soort: item.kind,
            }}
            dagen={days.map((day) => ({ key: day.key, long: day.long }))}
          />
        </FormulierKaart>
        <VerwijderOnderdeel id={item.id} titel={item.title} dag={dag} />
      </div>
    </>
  );
}
