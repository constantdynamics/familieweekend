import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  IconHartslag,
  IconInstellingen,
  IconLogboek,
  IconMedaille,
  IconMensen,
  IconPijlVerder,
  IconPin,
  IconProgramma,
  IconQuiz,
  IconSleutel,
  IconZeskamp,
} from "@/components/ui/icons";
import { Knop } from "@/components/ui/Knop";
import { Melding } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { familyCodeIsSet } from "@/lib/server/access";
import { listAudit } from "@/lib/server/audit";
import { getStaffSession, type StaffSession } from "@/lib/server/session";
import { readHeartbeat, readSettings } from "@/lib/server/settings";
import { formatDayAndTime, formatFull } from "@/lib/shared/time";
import { actieLabel } from "./labels";
import { logUit } from "./actions";
import { BeheerKop, BeheerLaden } from "./onderdelen";
import { PinLogin } from "./PinLogin";

export const metadata: Metadata = { title: "Beheer" };

export default function BeheerPage() {
  return (
    <Scherm metTabBalk={false}>
      <Suspense fallback={<BeheerLaden />}>
        <BeheerInhoud />
      </Suspense>
    </Scherm>
  );
}

async function BeheerInhoud() {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "beheerder") return <PinLogin />;
  return <Dashboard staff={staff} />;
}

async function Dashboard({ staff }: { staff: StaffSession }) {
  const [settings, codeSet, heartbeat, recent] = await Promise.all([
    readSettings(),
    familyCodeIsSet(),
    readHeartbeat(),
    listAudit(3),
  ]);

  const tiles = [
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
      href: "/beheer/logboek",
      titel: "Logboek",
      tekst: recent[0] ? `Laatst: ${actieLabel(recent[0].action).toLowerCase()}` : "Nog niets gebeurd",
      Icon: IconLogboek,
    },
  ];

  const binnenkort = [
    { titel: "Deelnemers en teams", wanneer: "januari", Icon: IconMensen },
    { titel: "Fun facts", wanneer: "januari", Icon: IconLogboek },
    { titel: "Programma", wanneer: "februari", Icon: IconProgramma },
    { titel: "Zeskamp en scorebord", wanneer: "februari", Icon: IconZeskamp },
    { titel: "Prijsuitreiking", wanneer: "februari", Icon: IconMedaille },
    { titel: "Quiz", wanneer: "maart", Icon: IconQuiz },
  ];

  return (
    <>
      <BeheerKop titel="Beheer" sub={`Ingelogd als ${staff.name}`} />

      {!codeSet ? (
        <div className="mt-4">
          <Melding tone="fout">
            Er is nog geen familiecode. Zonder code komt niemand binnen, stel hem dus eerst in.
          </Melding>
        </div>
      ) : null}

      <ul className="m-0 mt-5 grid list-none grid-cols-1 gap-3 p-0 min-[420px]:grid-cols-2">
        {tiles.map(({ href, titel, tekst, Icon, waarschuwing }) => (
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
                <span className="text-label leading-[1.35]">{tekst}</span>
              </span>
              <IconPijlVerder size={20} className="flex-none" />
            </Link>
          </li>
        ))}
      </ul>

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

      <h2 className="mt-7 mb-2 text-[15px] font-bold text-zand">Binnenkort in beheer</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {binnenkort.map(({ titel, wanneer, Icon }) => (
          <li key={titel} className="flex items-center gap-3 rounded-[18px] border-2 border-studio-licht px-4 py-3 text-zand">
            <Icon size={22} className="flex-none" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[16px] leading-tight font-bold">{titel}</span>
              <span className="text-label">vanaf {wanneer}</span>
            </span>
          </li>
        ))}
      </ul>

      <form action={logUit} className="mt-7">
        <Knop type="submit" variant="secundair">
          Log uit
        </Knop>
      </form>
    </>
  );
}
