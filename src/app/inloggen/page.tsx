import type { Metadata } from "next";
import Link from "next/link";
import { IconInstellingen, IconJoker, IconPijlVerder, IconStopwatch } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "Inloggen voor de spelleiding" };

const ROLLEN = [
  { href: "/captain", titel: "Captain", tekst: "Met de team-PIN. Deze telefoon wordt het teamtoestel.", Icon: IconJoker },
  {
    href: "/spelleider",
    titel: "Spelleider",
    tekst: "Met je eigen PIN. Voor de zeskamp en de spelletjesmiddag.",
    Icon: IconStopwatch,
  },
  { href: "/beheer", titel: "Beheerder", tekst: "Met de PIN van de beheerder. Alles regelen.", Icon: IconInstellingen },
];

/** One door for the three roles with a PIN. */
export default function InloggenPage() {
  return (
    <Scherm metTabBalk={false} boven={52}>
      <SchermTitel sub="Ben je captain, spelleider of beheerder? Kies hier hoe je inlogt.">Inloggen</SchermTitel>
      <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
        {ROLLEN.map(({ href, titel, tekst, Icon }) => (
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
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center self-start text-[15px] text-zand underline underline-offset-4"
      >
        Terug naar Thuis
      </Link>
    </Scherm>
  );
}
