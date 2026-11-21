import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { IconPijlTerug } from "@/components/ui/icons";
import { SchermTitel } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { getSettings } from "@/lib/server/settings";
import { teamsView } from "@/lib/server/team-overview";
import { TeamsWeergave } from "./TeamsWeergave";

export const metadata: Metadata = { title: "Teams" };

/**
 * The team screen (SPEC §4.4): per team the members, the captain and the
 * jokers. Linked from Thuis during the weekend; visible once the admin
 * makes the teams visible.
 */
export default function TeamsPage() {
  return (
    <Scherm>
      <Link
        href="/"
        className="-mt-3 -ml-1 mb-1 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
      >
        <IconPijlTerug size={20} />
        Thuis
      </Link>
      <SchermTitel sub="Wie speelt bij wie, en wie heeft de joker nog?">Teams</SchermTitel>
      <Suspense fallback={<Laden />}>
        <Inhoud />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud() {
  await connection();
  const [ctx, settings] = await Promise.all([getRequestContext(), getSettings()]);
  return <TeamsWeergave initial={await teamsView(ctx, settings)} isAdmin={ctx.isAdmin} />;
}

function Laden() {
  return (
    <div aria-busy="true" className="mt-4 flex flex-col gap-3">
      <span className="sr-only">Teams laden…</span>
      <div className="h-40 rounded-kaart bg-studio-licht" />
      <div className="h-40 rounded-kaart bg-studio-licht" />
    </div>
  );
}
