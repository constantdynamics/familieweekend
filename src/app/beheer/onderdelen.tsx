import Link from "next/link";
import type { ReactNode } from "react";
import { IconPijlTerug } from "@/components/ui/icons";
import { Chip } from "@/components/ui/Kaart";

/** Header for the admin screens: chip, title, subtitle and a way back. */
export function BeheerKop({ titel, sub, terug }: { titel: string; sub?: ReactNode; terug?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-2 pr-10">
      {terug ? (
        <Link
          href={terug.href}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
        >
          <IconPijlTerug size={20} />
          {terug.label}
        </Link>
      ) : null}
      <Chip>Beheerder</Chip>
      <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">{titel}</h1>
      {sub ? <p className="m-0 text-[15px] leading-[1.4] text-zand">{sub}</p> : null}
    </div>
  );
}

/** Placeholder while the admin check runs; same height as a short screen. */
export function BeheerLaden() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Beheer laden…</span>
      <div className="h-7 w-28 rounded-pil bg-studio-licht" />
      <div className="h-9 w-48 rounded-tegel bg-studio-licht" />
      <div className="h-40 rounded-kaart bg-studio-licht" />
    </div>
  );
}

/** Shown on admin screens while this device is in the test environment. */
export function ProefMelding() {
  return (
    <p
      role="status"
      className="m-0 mt-4 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] font-bold text-mosterd"
    >
      Je zit in de proefmodus. Wat je hier verandert, raakt alleen de proef, niet de echte Spelen.
    </p>
  );
}
