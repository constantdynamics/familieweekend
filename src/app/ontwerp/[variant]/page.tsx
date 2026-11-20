import { notFound } from "next/navigation";
import { ThuisVoor } from "@/components/home/ThuisVoor";
import { ONTWERPEN, type OntwerpSleutel } from "@/components/ui/ontwerp";
import { WelkomScherm } from "@/components/welkom/WelkomScherm";
import { getSettings } from "@/lib/server/settings";

/**
 * Design variants to choose from (A–D), for Thuis and the welcome screen.
 * Only available in a build made with VALK_ONTWERP=1; production shows 404.
 * Remove this route once a variant has been chosen.
 */
export function generateStaticParams() {
  return Object.keys(ONTWERPEN).flatMap((variant) => [{ variant: `${variant}-thuis` }, { variant: `${variant}-welkom` }]);
}

export default async function OntwerpPage({ params }: PageProps<"/ontwerp/[variant]">) {
  if (process.env.VALK_ONTWERP !== "1") notFound();
  const { variant } = await params;
  const [sleutel, scherm] = variant.split("-") as [OntwerpSleutel, string];
  const ontwerp = ONTWERPEN[sleutel];
  if (!ontwerp || (scherm !== "thuis" && scherm !== "welkom")) notFound();
  if (scherm === "welkom") return <WelkomScherm ontwerp={ontwerp} />;
  const settings = await getSettings();
  return <ThuisVoor settings={settings} renderedAt={Date.parse("2026-11-20T13:20:15Z")} ontwerp={ontwerp} />;
}
