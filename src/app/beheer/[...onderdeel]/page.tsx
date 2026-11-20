import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconInstellingen } from "@/components/ui/icons";
import { LegeStaat } from "@/components/ui/LegeStaat";
import { Suspense } from "react";
import { BeheerKop, BeheerLaden } from "../onderdelen";

export const metadata: Metadata = { title: "In aanbouw" };

/** Admin sections that are still being built get a friendly page instead of a 404. */
const IN_AANBOUW: Record<string, string> = {
  funfacts: "Fun facts",
  programma: "Programma",
  prikbord: "Prikbord",
  quiz: "Quiz",
  zeskamp: "Zeskamp",
  scorebord: "Scorebord en punten",
  prijsuitreiking: "Prijsuitreiking",
};

export default function InAanbouwPage({ params }: PageProps<"/beheer/[...onderdeel]">) {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud params={params} />
    </Suspense>
  );
}

async function Inhoud({ params }: { params: PageProps<"/beheer/[...onderdeel]">["params"] }) {
  const { onderdeel } = await params;
  const titel = IN_AANBOUW[onderdeel[0] ?? ""];
  if (!titel) notFound();
  return (
    <>
      <BeheerKop titel={titel} terug={{ href: "/beheer", label: "Beheer" }} />
      <div className="mt-5">
        <LegeStaat icon={<IconInstellingen size={34} />} titel="Wordt nog gebouwd">
          <p className="m-0">Dit onderdeel komt er binnenkort bij. De rest van beheer werkt al.</p>
        </LegeStaat>
      </div>
    </>
  );
}
