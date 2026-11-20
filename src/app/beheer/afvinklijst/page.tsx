import type { Metadata } from "next";
import { Suspense } from "react";
import { Afvinklijst } from "@/components/afvinklijst/Afvinklijst";
import { listChecklist } from "@/lib/server/checklist";
import { requireAdmin } from "@/lib/server/session";
import { BeheerKop, BeheerLaden } from "../onderdelen";

export const metadata: Metadata = { title: "Afvinklijst" };

export default function AfvinklijstPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

async function Inhoud() {
  const staff = await requireAdmin();
  const punten = await listChecklist();
  return (
    <>
      <BeheerKop
        titel="Afvinklijst"
        sub="Wat er nog moet gebeuren voor de Spelen. De spelleiders zien deze lijst ook en kunnen notities plaatsen."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      <Afvinklijst punten={punten} ikBen={{ name: staff.name, role: "beheerder" }} />
    </>
  );
}
