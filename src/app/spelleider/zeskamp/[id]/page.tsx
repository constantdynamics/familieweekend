import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Scherm } from "@/components/ui/Scherm";
import { getRequestContext } from "@/lib/server/context";
import { seesEverything } from "@/lib/server/scoreboard";
import { requireStaff } from "@/lib/server/session";
import { staffGameView } from "@/lib/server/zeskamp";
import { SpelleiderSpel } from "./SpelleiderSpel";

export const metadata: Metadata = { title: "Spel leiden" };

export default function SpelLeidenPage({ params }: PageProps<"/spelleider/zeskamp/[id]">) {
  return (
    <Scherm metTabBalk={false} boven={34}>
      <Suspense fallback={<div className="h-80 rounded-kaart bg-studio-licht" aria-busy="true" />}>
        <Inhoud params={params} />
      </Suspense>
    </Scherm>
  );
}

async function Inhoud({ params }: { params: PageProps<"/spelleider/zeskamp/[id]">["params"] }) {
  const staff = await requireStaff();
  const ctx = await getRequestContext();
  const { id } = await params;
  const view = await staffGameView(ctx.env, id, { admin: await seesEverything(ctx), name: staff.name });
  if (!view) notFound();
  return <SpelleiderSpel initial={view} env={ctx.env} rol={staff.role} />;
}
