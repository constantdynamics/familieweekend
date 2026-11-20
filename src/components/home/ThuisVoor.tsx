import Link from "next/link";
import { Embleem } from "@/components/brand/Embleem";
import { Bijgewerkt } from "@/components/pwa/AppSignalen";
import { Chip, Kaart } from "@/components/ui/Kaart";
import { Scherm } from "@/components/ui/Scherm";
import type { Settings } from "@/lib/server/settings";
import { bijElkaar } from "@/lib/shared/tekst";
import { amsterdamYear, formatDateRange, formatDayMonth } from "@/lib/shared/time";
import { Aftelklok } from "./Aftelklok";
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
    <Scherm spots="zacht" bocht={150}>
      <Bijgewerkt at={renderedAt} />
      <div className="flex items-center gap-3.5 pr-9">
        <Embleem size={96} label="Voorlopig embleem: een valk in een lauwerkrans" className="flex-none" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Chip>Hemelvaart {amsterdamYear(start)}</Chip>
          <p className="m-0 text-[17px] leading-snug font-bold">{formatDateRange(start, end)}</p>
          <p className="m-0 text-[15px] leading-[1.3] text-zand">
            {settings.locationName}, {bijElkaar(settings.locationPlace)}
          </p>
        </div>
      </div>

      <h1 className="mt-4 mb-0 font-display text-[clamp(30px,9.75vw,38px)] leading-[1.08] font-normal text-beeldbuis schaduw-oranje">
        De Valkenburger
        <br />
        Spelen
      </h1>

      <Aftelklok aftrap={settings.startAt} renderedAt={renderedAt} />

      <Kaart aria-labelledby="funfacts-titel" className="mt-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="funfacts-titel" className="m-0 text-[20px] leading-tight font-extrabold">
            Je fun facts
          </h2>
          <span className="rounded-pil bg-studio px-3 py-1 text-klein font-bold text-beeldbuis">Vanaf januari</span>
        </div>
        <p className="m-0 text-[15px] leading-[1.45]">
          In januari vul je hier een paar luchtige vragen in voor de quiz, plus je meest merkwaardige foto. Alleen
          de organisatie ziet je antwoorden.
        </p>
        <p className="m-0 text-label font-medium">Invullen kan tot {formatDayMonth(new Date(settings.funfactsDeadline))}.</p>
      </Kaart>

      <InstallatieHint />

      <p className="mt-3 mb-0 flex flex-wrap gap-x-5 gap-y-2 text-label text-zand">
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-zand underline underline-offset-4">
          Wat we bewaren
        </Link>
        <Link href="/beheer" className="inline-flex min-h-11 items-center text-zand underline underline-offset-4">
          Beheer
        </Link>
      </p>
    </Scherm>
  );
}
