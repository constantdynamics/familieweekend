import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconPijlOmhoog, IconPijlOmlaag, IconPotlood } from "@/components/ui/icons";
import { Schakelaar } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { listProgram } from "@/lib/server/program";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import {
  itemDetails,
  itemsOnDay,
  programDays,
  PROGRAM_KIND_LABELS,
  type ProgramItem,
} from "@/lib/shared/program";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { verplaatsOnderdeel, zetProgrammaZichtbaar } from "./actions";
import { FormulierKaart, ProgrammaFormulier } from "./onderdelen";

export const metadata: Metadata = { title: "Programma" };

const KLAAR: Record<string, string> = {
  bewaard: "Onderdeel bewaard. Iedereen ziet het meteen.",
  verwijderd: "Onderdeel verwijderd.",
};

export default function BeheerProgrammaPage({ searchParams }: PageProps<"/beheer/programma">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud searchParams={searchParams} />
    </Suspense>
  );
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/beheer/programma">["searchParams"] }) {
  await requireAdmin();
  const [ctx, settings, items, params] = await Promise.all([getRequestContext(), readSettings(), listProgram(), searchParams]);
  const days = programDays(items, settings.startAt, settings.endAt);
  const klaar = typeof params.klaar === "string" ? KLAAR[params.klaar] : undefined;

  return (
    <>
      <BeheerKop
        titel="Programma"
        sub="Wat iedereen ziet bij Programma en op Thuis. Een wijziging staat meteen op alle telefoons."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      {ctx.env === "test" ? (
        <p className="m-0 mt-4 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] font-bold text-mosterd">
          {bijElkaar("Let op: de proef en de echte Spelen hebben hetzelfde programma. Wat je hier verandert, ziet iedereen.", 0)}
        </p>
      ) : null}
      {klaar ? (
        <div className="mt-4">
          <Melding tone="goed">{klaar}</Melding>
        </div>
      ) : null}

      <Kaart className="mt-5 flex flex-col gap-2">
        <form action={zetProgrammaZichtbaar}>
          <Schakelaar
            aan={settings.programVisible}
            label="Programma zichtbaar voor de familie"
            hint={
              settings.fase2Live
                ? "Zet dit aan als het programma klaar is. Jij ziet het altijd al."
                : "Zet dit aan als het programma klaar is. De familie ziet het pas als de nieuwe app live staat; jij ziet het altijd al."
            }
          />
        </form>
      </Kaart>

      <nav aria-label="Op deze pagina" className="mt-4 flex flex-wrap gap-2">
        {[...days.map((day) => [`#dag-${day.key}`, day.short] as const), ["#nieuw", "Nieuw onderdeel"] as const].map(
          ([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-pil bg-studio-licht px-4 text-[15px] font-bold text-beeldbuis no-underline hover:text-beeldbuis"
            >
              {label}
            </a>
          ),
        )}
      </nav>

      <p className="m-0 mt-4 text-label leading-[1.4] text-zand">
        {bijElkaar(
          "De volgorde gaat op tijd. Beginnen twee onderdelen tegelijk, dan zet je ze met de pijltjes in de goede volgorde.",
          0,
        )}
      </p>

      {days.map((day) => {
        const dayItems = itemsOnDay(items, day.key);
        return (
          <section key={day.key} id={`dag-${day.key}`} aria-labelledby={`kop-${day.key}`} className="mt-6 flex scroll-mt-4 flex-col gap-2.5">
            <h2 id={`kop-${day.key}`} className="m-0 font-display text-[24px] font-normal schaduw-oranje">
              {day.long}
            </h2>
            {dayItems.length === 0 ? (
              <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px] text-zand">Nog niets op deze dag.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {dayItems.map((item) => (
                  <Rij key={item.id} item={item} samen={dayItems.filter((other) => other.startsAt === item.startsAt)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section id="nieuw" aria-label="Nieuw onderdeel" className="mt-8 scroll-mt-4">
        <FormulierKaart titel="Nieuw onderdeel">
          <ProgrammaFormulier
            id={null}
            beginwaarden={{ dag: days[0]?.key ?? "", begin: "", eind: "", titel: "", ondertitel: "", plek: "", soort: "gewoon" }}
            dagen={days.map((day) => ({ key: day.key, long: day.long }))}
          />
        </FormulierKaart>
      </section>
    </>
  );
}

/** One item: tap to change it; arrows only when another item starts at the same time. */
function Rij({ item, samen }: { item: ProgramItem; samen: ProgramItem[] }) {
  const index = samen.findIndex((other) => other.id === item.id);
  const extra = [itemDetails(item), item.kind === "gewoon" ? null : PROGRAM_KIND_LABELS[item.kind]].filter(Boolean).join(" · ");
  return (
    <li className="flex items-stretch gap-2">
      <Link
        href={`/beheer/programma/${item.id}`}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-[16px] bg-studio-licht px-3.5 py-2.5 text-beeldbuis no-underline hover:text-beeldbuis"
      >
        <span className="flex w-[60px] flex-none flex-col">
          <span className="font-display text-[20px] leading-[1.1] text-mosterd">{formatTime(new Date(item.startsAt))}</span>
          {item.endsAt ? <span className="text-klein text-zand">tot {formatTime(new Date(item.endsAt))}</span> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] leading-tight font-bold">{bijElkaar(item.title, 0)}</span>
          {extra ? <span className="text-label leading-[1.35] text-zand">{bijElkaar(extra, 0)}</span> : null}
        </span>
        <IconPotlood size={18} className="flex-none text-zand" />
        <span className="sr-only">Wijzig</span>
      </Link>
      {samen.length > 1 ? (
        <div className="flex flex-none flex-col justify-center gap-1">
          <Pijl id={item.id} richting="omhoog" titel={item.title} disabled={index === 0} />
          <Pijl id={item.id} richting="omlaag" titel={item.title} disabled={index === samen.length - 1} />
        </div>
      ) : null}
    </li>
  );
}

function Pijl({ id, richting, titel, disabled }: { id: string; richting: "omhoog" | "omlaag"; titel: string; disabled: boolean }) {
  const Icon = richting === "omhoog" ? IconPijlOmhoog : IconPijlOmlaag;
  return (
    <form action={verplaatsOnderdeel}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="richting" value={richting} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Zet ${titel} een plek ${richting}`}
        className="flex h-11 w-11 items-center justify-center rounded-pil border-2 border-zand text-beeldbuis disabled:opacity-35"
      >
        <Icon size={20} />
      </button>
    </form>
  );
}
