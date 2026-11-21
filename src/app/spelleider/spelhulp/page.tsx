import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconPijlTerug } from "@/components/ui/icons";
import { Chip, SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { requireStaff } from "@/lib/server/session";
import { listDecks } from "@/lib/server/spelhulp";
import { Spelhulp } from "./Spelhulp";

export const metadata: Metadata = { title: "Spelhulp" };

export default function SpelhulpPage() {
  return (
    <Scherm metTabBalk={false} boven={34}>
      <Suspense fallback={<div className="h-64 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  const staff = await requireStaff();
  const decks = await listDecks();
  return (
    <>
      <Link
        href="/spelleider"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
      >
        <IconPijlTerug size={20} />
        Spelleiding
      </Link>
      <SchermTitel
        chip={<Chip>{staff.role === "beheerder" ? "Beheerder" : "Spelleider"}</Chip>}
        sub="Kaartjes, een timer en een teller, voor uitbeelden en de spelletjesmiddag."
      >
        Spelhulp
      </SchermTitel>
      <Spelhulp decks={decks.map((deck) => ({ id: deck.id, name: deck.name, cards: deck.cards }))} />
    </>
  );
}
