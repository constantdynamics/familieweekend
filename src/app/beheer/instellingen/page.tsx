import type { Metadata } from "next";
import { Suspense } from "react";
import { Scherm } from "@/components/ui/Scherm";
import { requireAdmin } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { toAmsterdamInput } from "@/lib/shared/time";
import { BeheerKop, BeheerLaden } from "../onderdelen";
import { InstellingenFormulier } from "./InstellingenFormulier";

export const metadata: Metadata = { title: "Instellingen" };

export default function InstellingenPage() {
  return (
    <Scherm metTabBalk={false}>
      <Suspense fallback={<BeheerLaden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  await requireAdmin();
  const settings = await readSettings();
  const start = toAmsterdamInput(new Date(settings.startAt));
  const eind = toAmsterdamInput(new Date(settings.endAt));
  const deadline = toAmsterdamInput(new Date(settings.funfactsDeadline));
  return (
    <>
      <BeheerKop
        titel="Instellingen"
        sub="Wijzigingen zijn meteen zichtbaar op alle telefoons. Het logboek onthoudt de oude waarde."
        terug={{ href: "/beheer", label: "Beheer" }}
      />
      <InstellingenFormulier
        beginwaarden={{
          start_datum: start.date,
          start_tijd: start.time,
          eind_datum: eind.date,
          eind_tijd: eind.time,
          locatie: settings.locationName,
          plaats: settings.locationPlace,
          breedtegraad: String(settings.latitude).replace(".", ","),
          lengtegraad: String(settings.longitude).replace(".", ","),
          deadline_datum: deadline.date,
          deadline_tijd: deadline.time,
        }}
      />
    </>
  );
}
