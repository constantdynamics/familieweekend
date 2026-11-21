import Link from "next/link";
import { Embleem } from "@/components/brand/Embleem";
import { Woordmerk } from "@/components/brand/Woordmerk";
import { Bijgewerkt } from "@/components/pwa/AppSignalen";
import { Chip } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import type { Settings } from "@/lib/server/settings";
import { bijElkaar } from "@/lib/shared/tekst";
import { amsterdamYear, formatDateRange } from "@/lib/shared/time";
import { Aftelklok } from "./Aftelklok";
import { FunfactsKaart } from "./FunfactsKaart";
import { InstallatieHint } from "./Installatie";

type Props = {
  settings: Settings;
  /** When the page was rendered; the countdown starts here until it runs on the phone. */
  renderedAt: number;
};

/**
 * Thuis, vóór het weekend: emblem, dates, location, the flip-digit countdown,
 * the fun facts teaser and how to install the app. The spotlights stay soft
 * here, so the countdown keeps the attention.
 */
export function ThuisVoor({ settings, renderedAt }: Props) {
  const start = new Date(settings.startAt);
  const end = new Date(settings.endAt);

  return (
    <Scherm spots="zacht">
      <Bijgewerkt at={renderedAt} />
      <div className="flex items-center gap-3.5">
        <Embleem size={96} label="Voorlopig embleem: een valk in een lauwerkrans" className="flex-none" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Chip>Hemelvaart</Chip>
          <p className="m-0 text-[17px] leading-snug font-bold">{formatDateRange(start, end)}</p>
          <p className="m-0 text-[15px] leading-[1.3] text-zand">
            {settings.locationName}, {bijElkaar(settings.locationPlace)}
          </p>
        </div>
      </div>

      <Woordmerk jaar={amsterdamYear(start)} className="mt-4" />

      <Aftelklok aftrap={settings.startAt} renderedAt={renderedAt} />

      <FunfactsKaart settings={settings} now={renderedAt} />

      <InstallatieHint />

      <p className="mt-3 mb-0 flex flex-wrap gap-x-5 gap-y-2 text-label text-zand">
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-zand underline underline-offset-4">
          Wat we bewaren
        </Link>
        <Link href="/inloggen" className="inline-flex min-h-11 items-center text-zand underline underline-offset-4">
          Inloggen voor de spelleiding
        </Link>
      </p>
    </Scherm>
  );
}
