import type { Metadata } from "next";
import { Suspense } from "react";
import { Scherm } from "@/components/ui/Scherm";
import { requireAdmin } from "@/lib/server/session";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { PinFormulier } from "./PinFormulier";

export const metadata: Metadata = { title: "Mijn PIN" };

export default function PinPage() {
  return (
    <Scherm metTabBalk={false}>
      <Suspense fallback={<BeheerLaden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  const staff = await requireAdmin();
  return (
    <>
      <BeheerKop
        titel="Mijn PIN"
        sub={`Voor ${staff.name}. Na het wijzigen log je op andere telefoons opnieuw in.`}
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      <PinFormulier />
    </>
  );
}
