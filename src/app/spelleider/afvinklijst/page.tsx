import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Afvinklijst } from "@/components/afvinklijst/Afvinklijst";
import { IconPijlTerug } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { listChecklist } from "@/lib/server/checklist";
import { requireStaff } from "@/lib/server/session";

export const metadata: Metadata = { title: "Afvinklijst" };

export default function SpelleiderAfvinklijstPage() {
  return (
    <Scherm metTabBalk={false} boven={34}>
      <Link
        href="/spelleider"
        className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
      >
        <IconPijlTerug size={20} />
        Spelleiding
      </Link>
      <SchermTitel sub="Wat er nog moet gebeuren. Weet je iets, of regel je iets? Zet het erbij als notitie.">
        Afvinklijst
      </SchermTitel>
      <Suspense fallback={<div className="mt-6 h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  const staff = await requireStaff();
  const punten = await listChecklist();
  return <Afvinklijst punten={punten} ikBen={{ name: staff.name, role: staff.role }} />;
}
