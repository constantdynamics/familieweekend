import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconDownload, IconFoto, IconPijlOmhoog, IconPijlOmlaag, IconPijlVerder, IconPlus, IconPotlood } from "@/components/ui/icons";
import { IconStaafjes } from "@/components/ui/icons-funfacts";
import { Kaart } from "@/components/ui/Kaart";
import { getRequestContext } from "@/lib/server/context";
import { exportPhotos, listFunfactQuestions, listProgress } from "@/lib/server/funfacts";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { listTeams } from "@/lib/server/teams";
import {
  doneCounterText,
  formatNumber,
  funfactsPhase,
  KIND_LABELS,
  splitIntoParts,
  ZIP_PART_BYTES,
  type QuestionShape,
} from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatFull } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden, ProefMelding } from "../onderdelen";
import { verplaatsVraag } from "./actions";

export const metadata: Metadata = { title: "Fun facts" };

/** Server time decides when the list opens and closes (SPEC §4.2). */
function serverTijd(): number {
  return Date.now();
}

export default function FunfactsBeheerPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

function soortTekst(vraag: QuestionShape): string {
  if (vraag.kind === "getal") return `Getal, ${formatNumber(vraag.min ?? 0)} tot ${formatNumber(vraag.max ?? 0)}`;
  if (vraag.kind === "keuze") return `Keuze uit ${vraag.options?.length ?? 0}`;
  return KIND_LABELS[vraag.kind];
}

/** "maandag 21 december 2026 om 23:59", with the date itself never split over two lines. */
function moment(date: Date): string {
  return formatFull(date).replace(/(\d+) (\S+) (\d{4})/, "$1\u00a0$2\u00a0$3");
}

function megabytes(bytes: number): string {
  return `${formatNumber(Math.max(0.1, Math.round(bytes / 100_000) / 10))} MB`;
}

const tegelKlassen =
  "op-licht flex min-h-[72px] flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5";

const downloadKlassen =
  "inline-flex min-h-11 items-center gap-2 rounded-pil border-2 border-studio px-4 text-[15px] font-bold text-studio no-underline hover:bg-papier hover:text-studio";

async function Inhoud() {
  await requireAdmin();
  const ctx = await getRequestContext();
  await connection();
  const [settings, vragen, voortgang, teams, fotos] = await Promise.all([
    readSettings(),
    listFunfactQuestions(),
    listProgress(ctx.env),
    listTeams(ctx.env),
    exportPhotos(ctx.env),
  ]);
  const fase = funfactsPhase(settings.funfactsOpenAt, settings.funfactsDeadline, serverTijd());
  const open = new Date(settings.funfactsOpenAt);
  const deadline = new Date(settings.funfactsDeadline);
  const status =
    fase === "voor"
      ? `De lijst gaat open op ${moment(open)}.`
      : fase === "open"
        ? `De lijst is open tot ${moment(deadline)}.`
        : `De lijst is gesloten sinds ${moment(deadline)}.`;

  const klaar = voortgang.filter((p) => p.doneAt).length;
  const bezig = voortgang.filter((p) => !p.doneAt && p.answered + p.skipped > 0).length;
  const teamKleur = new Map(teams.map((t) => [t.id, t.color]));
  const actief = vragen.filter((v) => v.active).length;
  const delen = splitIntoParts(fotos, ZIP_PART_BYTES);
  const originelen = fotos.filter((f) => !f.ai).length;
  const proef = ctx.env === "test";

  return (
    <>
      <BeheerKop titel="Fun facts" sub={bijElkaar(status)} terug={{ href: "/beheer", label: "Beheer" }} />
      {proef ? <ProefMelding /> : null}

      <Kaart className="mt-5 flex flex-col gap-2.5" aria-labelledby="stand-titel">
        <h2 id="stand-titel" className="m-0 text-[20px] leading-tight font-extrabold">
          {voortgang.length === 0 ? "Nog niemand in de lijst" : bijElkaar(doneCounterText(klaar, voortgang.length))}
        </h2>
        {voortgang.length > 0 ? (
          <>
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pil bg-papier-streep">
              <div className="h-full rounded-pil bg-oranje" style={{ width: `${Math.round((klaar / voortgang.length) * 100)}%` }} />
            </div>
            <p className="m-0 text-label">
              {klaar} klaar, {bezig} bezig, {voortgang.length - klaar - bezig} nog niet begonnen.
            </p>
          </>
        ) : null}
        <p className="m-0 text-label leading-[1.4]">
          Opening en deadline wijzig je bij{" "}
          <Link href="/beheer/instellingen" className="font-bold text-studio underline underline-offset-4">
            Instellingen
          </Link>
          .
        </p>
      </Kaart>

      <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-3 p-0 min-[420px]:grid-cols-2">
        <li className="flex">
          <Link href="/beheer/funfacts/statistieken" className={tegelKlassen}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd">
              <IconStaafjes size={22} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[17px] leading-tight font-extrabold">Statistieken</span>
              <span className="text-label leading-[1.35]">{bijElkaar("Per vraag, met conceptvragen voor de quiz")}</span>
            </span>
            <IconPijlVerder size={20} className="flex-none" />
          </Link>
        </li>
        <li className="flex">
          <Link href="/beheer/funfacts/fotos" className={tegelKlassen}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd">
              <IconFoto size={22} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[17px] leading-tight font-extrabold">Echt of AI</span>
              <span className="text-label leading-[1.35]">
                {originelen === 1 ? "1 foto" : `${originelen} foto's`}
              </span>
            </span>
            <IconPijlVerder size={20} className="flex-none" />
          </Link>
        </li>
      </ul>

      <nav aria-label="Op deze pagina" className="mt-5 flex flex-wrap gap-2">
        {[
          ["#voortgang", "Voortgang"],
          ["#vragen", "Vragen"],
          ["#export", "Export"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-pil bg-studio-licht px-4 text-[15px] font-bold text-beeldbuis no-underline hover:text-beeldbuis"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="voortgang" aria-labelledby="voortgang-titel" className="mt-6 flex scroll-mt-4 flex-col gap-3">
        <h2 id="voortgang-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Voortgang
        </h2>
        {voortgang.length === 0 ? (
          <p className="m-0 rounded-[16px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
            {bijElkaar("Nog niemand in de lijst. Zet eerst de namen erin bij Deelnemers en teams.")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {voortgang.map((persoon) => {
              const kleur = persoon.teamId ? teamKleur.get(persoon.teamId) : undefined;
              const stand = persoon.doneAt ? "Klaar" : persoon.answered + persoon.skipped > 0 ? "Bezig" : "Nog niet begonnen";
              return (
                <li key={persoon.id} className="flex items-center gap-3 rounded-[16px] bg-studio-licht px-4 py-2.5">
                  {kleur ? <TeamVlak kleur={kleur} /> : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] leading-tight font-bold">{persoon.name}</span>
                    <span className="text-label text-zand">
                      {bijElkaar(
                        `${persoon.answered} beantwoord, ${persoon.skipped} overgeslagen${persoon.claimed ? "" : ", naam nog niet gekozen"}`,
                      )}
                    </span>
                  </span>
                  <span
                    className={`flex-none rounded-pil px-2.5 py-0.5 text-klein font-bold ${
                      persoon.doneAt ? "bg-avocado-licht text-studio" : stand === "Bezig" ? "bg-mosterd text-studio" : "bg-studio text-zand"
                    }`}
                  >
                    {stand}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="vragen" aria-labelledby="vragen-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="vragen-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Vragen
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar(`${actief} van de ${vragen.length} vragen staan aan. De familie ziet ze in deze volgorde.`)}
        </p>
        {proef ? (
          <p className="m-0 rounded-[16px] border-2 border-dashed border-mosterd px-4 py-3 text-[15px] leading-[1.4] text-mosterd">
            {bijElkaar("De vragen zijn voor de proef en het echte weekend hetzelfde. Wijzigen kan buiten de proef.")}
          </p>
        ) : (
          <Link
            href="/beheer/funfacts/vragen/nieuw"
            className="inline-flex min-h-12 items-center gap-2 self-start rounded-pil bg-oranje px-[22px] text-[17px] font-extrabold text-studio no-underline shadow-knop hover:text-studio active:translate-y-[3px] active:shadow-knop-in"
          >
            <IconPlus size={20} />
            Nieuwe vraag
          </Link>
        )}
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {vragen.map((vraag, index) => (
            <li key={vraag.id} className="flex items-stretch gap-2 rounded-[16px] bg-studio-licht py-2 pr-2 pl-4">
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1">
                <span className={`text-[16px] leading-snug font-bold ${vraag.active ? "" : "text-zand"}`}>
                  {index + 1}. {bijElkaar(vraag.text)}
                </span>
                <span className="text-label text-zand">
                  {soortTekst(vraag)}
                  {vraag.active ? "" : " · staat uit"}
                </span>
              </span>
              {proef ? null : (
                <span className="flex flex-none items-center gap-1">
                  <form action={verplaatsVraag} className="flex flex-col">
                    <input type="hidden" name="id" value={vraag.id} />
                    <button
                      type="submit"
                      name="richting"
                      value="op"
                      disabled={index === 0}
                      aria-label={`Zet vraag ${index + 1} een plek hoger`}
                      className="flex h-11 w-11 items-center justify-center rounded-pil text-beeldbuis hover:bg-studio-rand disabled:opacity-30"
                    >
                      <IconPijlOmhoog size={18} />
                    </button>
                    <button
                      type="submit"
                      name="richting"
                      value="neer"
                      disabled={index === vragen.length - 1}
                      aria-label={`Zet vraag ${index + 1} een plek lager`}
                      className="flex h-11 w-11 items-center justify-center rounded-pil text-beeldbuis hover:bg-studio-rand disabled:opacity-30"
                    >
                      <IconPijlOmlaag size={18} />
                    </button>
                  </form>
                  <Link
                    href={`/beheer/funfacts/vragen/${vraag.id}`}
                    aria-label={`Wijzig vraag ${index + 1}`}
                    className="flex h-11 w-11 items-center justify-center rounded-pil bg-mosterd text-studio hover:text-studio"
                  >
                    <IconPotlood size={20} />
                  </Link>
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section id="export" aria-labelledby="export-titel" className="mt-8 flex scroll-mt-4 flex-col gap-3">
        <h2 id="export-titel" className="m-0 font-display text-[24px] font-normal schaduw-oranje">
          Export
        </h2>
        <Kaart className="flex flex-col gap-3">
          <p className="m-0 text-[15px] leading-[1.45]">
            {bijElkaar(
              "Alle antwoorden, voor jezelf of om de quiz te maken met Claude (SPEC, bijlage B). Bewaar ze veilig: ze zijn privé.",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/beheer/funfacts/export/funfacts.csv" download className={downloadKlassen}>
              <IconDownload size={20} />
              Download CSV
            </a>
            <a href="/beheer/funfacts/export/funfacts.json" download className={downloadKlassen}>
              <IconDownload size={20} />
              Download JSON
            </a>
          </div>
          <div className="flex flex-col gap-2 border-t-2 border-papier-streep pt-3">
            <h3 className="m-0 text-[17px] font-extrabold">Foto&apos;s als zip</h3>
            {delen.length === 0 ? (
              <p className="m-0 text-label">Nog geen foto&apos;s.</p>
            ) : (
              <>
                <p className="m-0 text-label leading-[1.4]">
                  {bijElkaar(
                    `${fotos.length === 1 ? "1 bestand" : `${fotos.length} bestanden`}, met de AI-versies erbij.${
                      delen.length > 1 ? ` In ${delen.length} delen, zodat elke download klein genoeg blijft.` : ""
                    }`,
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {delen.map((deel, index) => (
                    <a
                      key={index}
                      href={`/beheer/funfacts/export/fotos.zip${delen.length > 1 ? `?deel=${index + 1}` : ""}`}
                      download
                      className={downloadKlassen}
                    >
                      <IconDownload size={20} />
                      {delen.length > 1 ? `Deel ${index + 1}` : "Download zip"}
                      <span className="font-medium">({megabytes(deel.reduce((total, f) => total + f.size, 0))})</span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </Kaart>
      </section>
    </>
  );
}
