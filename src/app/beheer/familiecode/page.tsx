import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/server/session";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { FamiliecodeFormulier } from "./FamiliecodeFormulier";

export const metadata: Metadata = { title: "Familiecode" };

export default function FamiliecodePage() {
  return (
    <>
      <Suspense fallback={<BeheerLaden />}>
        <Inhoud />
      </Suspense>
    </>
  );
}

async function Inhoud() {
  await requireAdmin();
  return (
    <>
      <BeheerKop
        titel="Familiecode"
        sub="De sleutel voor iedereen. Na het wijzigen werkt de oude code niet meer op nieuwe telefoons. Wie al binnen is, blijft binnen."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      <FamiliecodeFormulier />
      <p className="mt-5 mb-0 text-label leading-[1.4] text-zand">
        De code wordt alleen versleuteld bewaard. Schrijf hem dus op voordat je hem in de familie-app zet; ook de
        beheerder kan hem later niet meer teruglezen.
      </p>
    </>
  );
}
