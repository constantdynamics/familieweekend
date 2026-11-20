import Link from "next/link";
import { Embleem } from "@/components/brand/Embleem";
import { Bijgewerkt } from "@/components/pwa/AppSignalen";
import { Chip, Kaart } from "@/components/ui/Kaart";
import { HUIDIG, type Ontwerp } from "@/components/ui/ontwerp";
import { Scherm } from "@/components/ui/Scherm";
import type { Settings } from "@/lib/server/settings";
import { amsterdamYear, formatDateRange, formatDayMonth } from "@/lib/shared/time";
import { Aftelklok } from "./Aftelklok";
import { InstallatieHint } from "./Installatie";

type Props = {
  settings: Settings;
  /** When the page was rendered; the countdown starts here until it runs on the phone. */
  renderedAt: number;
  ontwerp?: Ontwerp;
};

/**
 * Thuis, vóór het weekend: emblem, dates, location, the flip-digit countdown,
 * the fun facts teaser and how to install the app.
 */
export function ThuisVoor({ settings, renderedAt, ontwerp = HUIDIG }: Props) {
  const start = new Date(settings.startAt);
  const end = new Date(settings.endAt);
  const ruim = ontwerp.ruim;

  return (
    <Scherm stralen bocht={150} ontwerp={ontwerp} boven={ruim ? 58 : 50}>
      <Bijgewerkt at={renderedAt} />
      <div className="flex items-center gap-3.5 pr-9">
        <Embleem size={ruim ? 104 : 96} label="Voorlopig embleem: een valk in een lauwerkrans" className="flex-none" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Chip>Hemelvaart {amsterdamYear(start)}</Chip>
          <p className="m-0 text-[17px] leading-snug font-bold">{formatDateRange(start, end)}</p>
          <p className="m-0 text-[15px] leading-[1.3] text-zand">
            {settings.locationName}, {settings.locationPlace}
          </p>
        </div>
      </div>

      <h1
        className={`${ruim ? "mt-7" : "mt-4"} mb-0 font-display text-[clamp(30px,9.75vw,38px)] leading-[1.08] font-normal text-beeldbuis schaduw-oranje`}
      >
        De Valkenburger
        <br />
        Spelen
      </h1>

      <Aftelklok aftrap={settings.startAt} renderedAt={renderedAt} className={ruim ? "mt-8" : undefined} />

      <Kaart aria-labelledby="funfacts-titel" className={`${ruim ? "mt-8 gap-3 p-[22px]!" : "mt-4 gap-2.5"} flex flex-col`}>
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

      <div className={ruim ? "mt-4" : undefined}>
        <InstallatieHint />
      </div>

      <p className={`${ruim ? "mt-6" : "mt-3"} mb-0 flex flex-wrap gap-x-5 gap-y-2 text-label text-zand`}>
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
