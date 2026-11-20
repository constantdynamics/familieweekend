import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  IconAfvinklijst,
  IconHartslag,
  IconInstellingen,
  IconLogboek,
  IconMedaille,
  IconMensen,
  IconPijlVerder,
  IconPin,
  IconPrikbord,
  IconProef,
  IconProgramma,
  IconQuiz,
  IconScore,
  IconSleutel,
  IconZeskamp,
} from "@/components/ui/icons";
import { Knop } from "@/components/ui/Knop";
import { Melding } from "@/components/ui/Kaart";
import { familyCodeIsSet } from "@/lib/server/access";
import { listAudit } from "@/lib/server/audit";
import { getRequestContext } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getStaffSession, type StaffSession } from "@/lib/server/session";
import { readHeartbeat, readSettings } from "@/lib/server/settings";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayAndTime, formatFull } from "@/lib/shared/time";
import { actieLabel } from "./labels";
import { logUit } from "./actions";
import { BeheerKop, BeheerLaden, ProefMelding } from "./onderdelen";
import { PinLogin } from "./PinLogin";

export const metadata: Metadata = { title: "Beheer" };

export default function BeheerPage() {
  return (
    <>
      <Suspense fallback={<BeheerLaden />}>
        <BeheerInhoud />
      </Suspense>
    </>
  );
}

async function BeheerInhoud() {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "beheerder") return <PinLogin />;
  return <Dashboard staff={staff} />;
}

type Tegel = {
  href: string;
  titel: string;
  tekst: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactNode;
  waarschuwing?: boolean;
};

async function Dashboard({ staff }: { staff: StaffSession }) {
  const ctx = await getRequestContext();
  const [settings, codeSet, heartbeat, recent, teller] = await Promise.all([
    readSettings(),
    familyCodeIsSet(),
    readHeartbeat(),
    listAudit(3),
    db()<{ deelnemers: number; gekozen: number }[]>`
      select count(*)::int as deelnemers, count(claimed_device_id)::int as gekozen
      from valk.participants where env = ${ctx.env}
    `,
  ]);
  const { deelnemers, gekozen } = teller[0] ?? { deelnemers: 0, gekozen: 0 };

  const groepen: { titel: string; tegels: Tegel[] }[] = [
    {
      titel: "Voorbereiden",
      tegels: [
        {
          href: "/beheer/deelnemers",
          titel: "Deelnemers en teams",
          tekst: deelnemers === 0 ? "Nog niemand in de lijst" : `${deelnemers} deelnemers, ${gekozen} gekozen`,
          Icon: IconMensen,
          waarschuwing: deelnemers === 0,
        },
        { href: "/beheer/funfacts", titel: "Fun facts", tekst: "Vragen en voortgang", Icon: IconLogboek },
        {
          href: "/beheer/programma",
          titel: "Programma",
          tekst: settings.programVisible ? "Zichtbaar voor iedereen" : "Nog niet zichtbaar",
          Icon: IconProgramma,
        },
        { href: "/beheer/prikbord", titel: "Prikbord", tekst: "Kanalen en berichten", Icon: IconPrikbord },
        { href: "/beheer/afvinklijst", titel: "Afvinklijst", tekst: "Wat er nog moet gebeuren", Icon: IconAfvinklijst },
      ],
    },
    {
      titel: "Het weekend",
      tegels: [
        { href: "/beheer/quiz", titel: "Quiz", tekst: "Vragen en quizmaster", Icon: IconQuiz },
        { href: "/beheer/zeskamp", titel: "Zeskamp", tekst: "Spellen en vrijdag", Icon: IconZeskamp },
        { href: "/beheer/scorebord", titel: "Scorebord en punten", tekst: "Stand, punten en slot", Icon: IconScore },
        { href: "/beheer/prijsuitreiking", titel: "Prijsuitreiking", tekst: "De ceremonie", Icon: IconMedaille },
      ],
    },
    {
      titel: "Instellingen en veiligheid",
      tegels: [
        {
          href: "/beheer/instellingen",
          titel: "Instellingen",
          tekst: `Aftrap ${formatDayAndTime(new Date(settings.startAt))}`,
          Icon: IconInstellingen,
        },
        {
          href: "/beheer/familiecode",
          titel: "Familiecode",
          tekst: codeSet ? "Ingesteld. Hier wijzig je hem." : "Nog niet ingesteld!",
          Icon: IconSleutel,
          waarschuwing: !codeSet,
        },
        { href: "/beheer/pin", titel: "Mijn PIN", tekst: "Wijzig je eigen PIN", Icon: IconPin },
        {
          href: "/beheer/proef",
          titel: "Proefmodus",
          tekst: ctx.env === "test" ? "Je zit nu in de proef" : "Probeer alles uit",
          Icon: IconProef,
        },
        {
          href: "/beheer/logboek",
          titel: "Logboek",
          tekst: recent[0] ? `Laatst: ${actieLabel(recent[0].action).toLowerCase()}` : "Nog niets gebeurd",
          Icon: IconLogboek,
        },
      ],
    },
  ];

  return (
    <>
      <BeheerKop titel="Beheer" sub={`Ingelogd als ${staff.name}`} />
      {ctx.env === "test" ? <ProefMelding /> : null}

      {!codeSet ? (
        <div className="mt-4">
          <Melding tone="fout">
            Er is nog geen familiecode. Zonder code komt niemand binnen, stel hem dus eerst in.
          </Melding>
        </div>
      ) : null}

      {groepen.map((groep) => (
        <section key={groep.titel} aria-labelledby={`groep-${groep.titel}`} className="mt-6">
          <h2 id={`groep-${groep.titel}`} className="m-0 mb-2.5 text-[15px] font-bold text-zand">
            {groep.titel}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[420px]:grid-cols-2">
            {groep.tegels.map(({ href, titel, tekst, Icon, waarschuwing }) => (
              <li key={href} className="flex">
                <Link
                  href={href}
                  className="op-licht flex min-h-[84px] flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
                >
                  <span
                    className={`flex h-11 w-11 flex-none items-center justify-center rounded-pil ${
                      waarschuwing ? "bg-roest text-beeldbuis" : "bg-mosterd text-studio"
                    }`}
                  >
                    <Icon size={22} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] leading-tight font-extrabold">{titel}</span>
                    <span className="text-label leading-[1.35]">{bijElkaar(tekst)}</span>
                  </span>
                  <IconPijlVerder size={20} className="flex-none" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="status-titel" className="mt-6 flex flex-col gap-2 rounded-[18px] bg-studio-licht px-4 py-3.5">
        <h2 id="status-titel" className="m-0 flex items-center gap-2 text-[15px] font-bold">
          <IconHartslag size={20} className="text-avocado-licht" />
          Database wakker
        </h2>
        <p className="m-0 text-label leading-[1.4] text-zand">
          {heartbeat && heartbeat.beats > 0
            ? `Laatste seintje van de dagelijkse keepalive: ${formatFull(new Date(heartbeat.lastSeenAt))}.`
            : "De dagelijkse keepalive heeft nog niet gedraaid. Dat gebeurt elke ochtend vanzelf."}
        </p>
      </section>

      <form action={logUit} className="mt-7">
        <Knop type="submit" variant="secundair">
          Log uit
        </Knop>
      </form>
    </>
  );
}
