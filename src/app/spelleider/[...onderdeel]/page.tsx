import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconStopwatch } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Scherm } from "@/components/ui/Scherm";

export const metadata: Metadata = { title: "In aanbouw" };

const IN_AANBOUW: Record<string, string> = { zeskamp: "Zeskamp", spelhulp: "Spelhulp" };

/** Spelleider screens that are still being built. */
export default function InAanbouwPage({ params }: PageProps<"/spelleider/[...onderdeel]">) {
  return (
    <Scherm metTabBalk={false} boven={52}>
      <Suspense fallback={<div className="h-40 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Titel params={params} />
      </Suspense>
      <div className="mt-5">
        <LegeStaat icon={<IconStopwatch size={34} />} titel="Wordt nog gebouwd">
          <p className="m-0">Dit scherm komt er binnenkort bij.</p>
        </LegeStaat>
      </div>
      <Link href="/spelleider" className="mt-5 inline-flex min-h-11 items-center self-start text-[15px] text-zand underline underline-offset-4">
        Terug naar de spelleiding
      </Link>
    </Scherm>
  );
}

async function Titel({ params }: { params: PageProps<"/spelleider/[...onderdeel]">["params"] }) {
  const { onderdeel } = await params;
  const titel = IN_AANBOUW[onderdeel[0] ?? ""];
  if (!titel) notFound();
  return <SchermTitel>{titel}</SchermTitel>;
}
