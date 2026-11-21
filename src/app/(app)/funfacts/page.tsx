import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { IconMensen, IconPijlVerder, IconVinkje } from "@/components/ui/icons";
import { IconZandloper } from "@/components/ui/icons-funfacts";
import { SchermTitel } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext, type RequestContext } from "@/lib/server/context";
import { answersForParticipant, listFunfactQuestions, progressForParticipants } from "@/lib/server/funfacts";
import { getSettings } from "@/lib/server/settings";
import { signedPhotoUrl } from "@/lib/server/uploads";
import { funfactsPhase, uploadIdOf } from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayMonth } from "@/lib/shared/time";
import { Invullen, type AntwoordView } from "./Invullen";

export const metadata: Metadata = { title: "Fun facts" };

/** Server time decides when the list opens and closes (SPEC §4.2). */
function serverTijd(): number {
  return Date.now();
}

/**
 * Fun facts (SPEC §4.2): one question per screen for the names on this
 * device. Everyone only ever gets their own answers back.
 */
export default function FunfactsPage({ searchParams }: PageProps<"/funfacts">) {
  return (
    <Suspense fallback={<Laden />}>
      <Inhoud searchParams={searchParams} />
    </Suspense>
  );
}

function Laden() {
  return (
    <Scherm>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">Fun facts laden…</span>
        <div className="h-9 w-48 rounded-tegel bg-studio-licht" />
        <div className="h-64 rounded-kaart bg-studio-licht" />
      </div>
    </Scherm>
  );
}

async function Inhoud({ searchParams }: { searchParams: PageProps<"/funfacts">["searchParams"] }) {
  const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
  // Unfinished work stays out of sight until the owner releases it.
  if (!settings.fase2Live && !ctx.isAdmin) notFound();
  await connection();

  const fase = funfactsPhase(settings.funfactsOpenAt, settings.funfactsDeadline, serverTijd());
  const deadline = formatDayMonth(new Date(settings.funfactsDeadline));
  if (fase === "voor") return <VoorDeOpening openAt={settings.funfactsOpenAt} deadline={deadline} />;
  if (ctx.names.length === 0) return <GeenNaam dicht={fase === "dicht"} />;

  const { voor } = await searchParams;
  const gekozen = typeof voor === "string" ? ctx.names.find((n) => n.id === voor) : undefined;
  const persoon = gekozen ?? (ctx.names.length === 1 ? ctx.names[0] : null);
  if (!persoon) return <KiesPersoon ctx={ctx} open={fase === "open"} />;

  const [vragen, opgeslagen] = await Promise.all([listFunfactQuestions({ activeOnly: true }), answersForParticipant(persoon.id)]);
  const actief = new Set(vragen.map((v) => v.id));
  const antwoorden: Record<string, AntwoordView> = {};
  for (const antwoord of opgeslagen) {
    if (!actief.has(antwoord.questionId)) continue;
    const upload = uploadIdOf(antwoord.value);
    antwoorden[antwoord.questionId] = {
      value: antwoord.value,
      skipped: antwoord.skipped,
      // Only the person themself gets a link to their photo; it expires.
      fotoUrl: upload ? await signedPhotoUrl(upload, 3600) : null,
    };
  }

  return (
    <Scherm>
      <Invullen
        key={persoon.id}
        persoon={{ id: persoon.id, naam: persoon.displayName }}
        anderen={ctx.names
          .filter((n) => n.id !== persoon.id)
          .map((n) => ({ id: n.id, naam: n.displayName, klaar: n.funfactsDoneAt !== null }))}
        vragen={vragen.map((v) => ({ id: v.id, kind: v.kind, text: v.text, hint: v.hint, options: v.options, min: v.min, max: v.max }))}
        antwoorden={antwoorden}
        klaar={persoon.funfactsDoneAt !== null}
        alleenLezen={fase === "dicht" ? "dicht" : ctx.viewAs ? "bekijken" : null}
        deadline={deadline}
      />
    </Scherm>
  );
}

function VoorDeOpening({ openAt, deadline }: { openAt: string; deadline: string }) {
  return (
    <Scherm>
      <SchermTitel sub="Luchtige vragen voor de quiz">Je fun facts</SchermTitel>
      <div className="mt-4">
        <LegeStaat icon={<IconZandloper size={34} />} titel={`Vanaf ${formatDayMonth(new Date(openAt))}`} voetnoot={bijElkaar(`Invullen kan tot ${deadline}.`)}>
          <p className="m-0">Dan vul je hier een lijst met luchtige vragen in, plus je meest merkwaardige foto.</p>
          <p className="m-0">{bijElkaar("De antwoorden worden het materiaal voor de quiz. Alleen de organisatie ziet ze.")}</p>
        </LegeStaat>
      </div>
      <KnopLink href="/" variant="secundair" className="mt-5 self-start">
        Terug naar Thuis
      </KnopLink>
    </Scherm>
  );
}

function GeenNaam({ dicht }: { dicht: boolean }) {
  return (
    <Scherm>
      <SchermTitel sub="Luchtige vragen voor de quiz">Je fun facts</SchermTitel>
      <div className="mt-4">
        <LegeStaat icon={<IconMensen size={34} />} titel={dicht ? "De lijst is gesloten" : "Wie ben jij?"}>
          {dicht ? (
            <p className="m-0">{bijElkaar("Dank je wel! Invullen kan niet meer, maar in de quiz doe je gewoon mee.")}</p>
          ) : (
            <p className="m-0">{bijElkaar("Kies eerst je naam. Dan weet de app voor wie je de vragen invult.")}</p>
          )}
        </LegeStaat>
      </div>
      {dicht ? (
        <KnopLink href="/" variant="secundair" className="mt-5 self-start">
          Terug naar Thuis
        </KnopLink>
      ) : (
        <KnopLink href="/wie-ben-jij?terug=/funfacts" className="mt-5 self-start">
          Kies je naam
        </KnopLink>
      )}
    </Scherm>
  );
}

async function KiesPersoon({ ctx, open }: { ctx: RequestContext; open: boolean }) {
  const [vragen, voortgang] = await Promise.all([
    listFunfactQuestions({ activeOnly: true }),
    progressForParticipants(
      ctx.env,
      ctx.names.map((n) => n.id),
    ),
  ]);
  return (
    <Scherm>
      <SchermTitel sub="Op deze telefoon staan meer namen.">Voor wie vul je in?</SchermTitel>
      <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
        {ctx.names.map((naam) => {
          const gedaan = voortgang.get(naam.id) ?? 0;
          const stand =
            naam.funfactsDoneAt !== null
              ? "Klaar"
              : gedaan > 0
                ? `${gedaan} van de ${vragen.length} vragen gedaan`
                : "Nog niet begonnen";
          return (
            <li key={naam.id} className="flex">
              <Link
                href={`/funfacts?voor=${naam.id}`}
                className="op-licht flex min-h-[72px] flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
              >
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-pil ${
                    naam.funfactsDoneAt !== null ? "bg-avocado-licht" : "bg-mosterd"
                  }`}
                >
                  {naam.funfactsDoneAt !== null ? <IconVinkje size={22} /> : <IconMensen size={22} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[19px] leading-tight font-extrabold">{naam.displayName}</span>
                  <span className="text-label">{bijElkaar(stand)}</span>
                </span>
                <IconPijlVerder size={20} className="flex-none" />
              </Link>
            </li>
          );
        })}
      </ul>
      {open && !ctx.viewAs ? (
        <Link
          href="/wie-ben-jij?terug=/funfacts"
          className="mt-4 inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4"
        >
          Ik vul ook in voor…
        </Link>
      ) : null}
    </Scherm>
  );
}
