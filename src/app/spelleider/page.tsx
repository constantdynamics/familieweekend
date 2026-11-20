import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconAfvinklijst, IconKaartjes, IconPijlVerder, IconStopwatch } from "@/components/ui/icons";
import { Chip, SchermTitel } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";
import { getStaffSession } from "@/lib/server/session";
import { logUitSpelleider } from "./actions";
import { SpelleiderLogin } from "./SpelleiderLogin";

export const metadata: Metadata = { title: "Spelleider" };

export default function SpelleiderPage() {
  return (
    <Scherm metTabBalk={false} boven={52}>
      <Suspense fallback={<div className="h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

const TEGELS = [
  {
    href: "/spelleider/zeskamp",
    titel: "Zeskamp en spelletjesmiddag",
    tekst: "Stopwatch, tellers en uitslagen",
    Icon: IconStopwatch,
  },
  { href: "/spelleider/spelhulp", titel: "Spelhulp", tekst: "Kaartjesmachine, timer en teller", Icon: IconKaartjes },
  {
    href: "/spelleider/afvinklijst",
    titel: "Afvinklijst",
    tekst: "Wat er nog moet gebeuren, met notities",
    Icon: IconAfvinklijst,
  },
];

async function Inhoud() {
  const staff = await getStaffSession();
  if (!staff) {
    return (
      <>
        <SchermTitel sub="Voor de spelleiders van de zeskamp en de spelletjesmiddag.">Spelleider</SchermTitel>
        <SpelleiderLogin />
      </>
    );
  }
  return (
    <>
      <SchermTitel
        chip={<Chip>{staff.role === "beheerder" ? "Beheerder" : "Spelleider"}</Chip>}
        sub={`Hoi ${staff.name}! Wat ga je doen?`}
      >
        Spelleiding
      </SchermTitel>
      <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
        {TEGELS.map(({ href, titel, tekst, Icon }) => (
          <li key={href} className="flex">
            <Link
              href={href}
              className="op-licht flex min-h-[84px] flex-1 items-center gap-3 rounded-kaart bg-beeldbuis p-4 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd text-studio">
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
      <form action={logUitSpelleider} className="mt-6">
        <Knop type="submit" variant="secundair" size="klein">
          Log uit
        </Knop>
      </form>
    </>
  );
}
