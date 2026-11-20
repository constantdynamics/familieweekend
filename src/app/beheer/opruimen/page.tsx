import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/server/session";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { Opruimen } from "./Opruimen";

export const metadata: Metadata = { title: "Alles opruimen" };

export default function OpruimenPage() {
  return (
    <Suspense fallback={<BeheerLaden />}>
      <Inhoud />
    </Suspense>
  );
}

async function Inhoud() {
  await requireAdmin();
  return (
    <>
      <BeheerKop
        titel="Na afloop"
        sub="Als het weekend voorbij is, ruim je hier de persoonlijke gegevens op (SPEC: wat we bewaren en wanneer we het weggooien)."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      <div className="mt-5">
        <Opruimen />
      </div>
    </>
  );
}
