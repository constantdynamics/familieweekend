import Link from "next/link";
import { Embleem } from "@/components/brand/Embleem";
import { Woordmerk } from "@/components/brand/Woordmerk";
import { Chip, Paneel } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { Scherm } from "@/components/ui/Scherm";
import { bijElkaar } from "@/lib/shared/tekst";
import { amsterdamYear, formatDateRange } from "@/lib/shared/time";
import type { WeekendInfo } from "./ThuisTijdens";

/**
 * Thuis after the weekend (SPEC §4.1): "Tot de volgende Spelen", with the way
 * to the final standings. The scoreboard with podium and medal table lives
 * on its own screen (/score).
 */
export function ThuisNa({ weekend }: { weekend: WeekendInfo }) {
  const start = new Date(weekend.startAt);
  const end = new Date(weekend.endAt);
  return (
    <Scherm spots="zacht">
      <div className="flex items-center gap-3.5">
        <Embleem size={96} label="Voorlopig embleem: een valk in een lauwerkrans" className="flex-none" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Chip>Hemelvaart</Chip>
          <p className="m-0 text-[17px] leading-snug font-bold">{formatDateRange(start, end)}</p>
          <p className="m-0 text-[15px] leading-[1.3] text-zand">
            {weekend.locationName}, {bijElkaar(weekend.locationPlace)}
          </p>
        </div>
      </div>

      <Woordmerk jaar={amsterdamYear(start)} className="mt-4" />

      <Paneel aria-labelledby="thuis-na-titel" className="mt-[18px] flex flex-col items-start gap-3">
        <h2 id="thuis-na-titel" className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">
          Tot de volgende Spelen!
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">
          {bijElkaar("Wat een weekend. Dank je wel voor alle spelletjes, sterke verhalen en gezelligheid.", 0)}
        </p>
        <KnopLink href="/score">Bekijk de eindstand</KnopLink>
      </Paneel>

      <p className="mt-4 mb-0 text-[15px] leading-[1.45] text-zand">
        Nog even nagenieten? Zet je mooiste foto&apos;s op{" "}
        <Link href="/prikbord" className="font-bold underline underline-offset-4">
          het{" "}prikbord
        </Link>
        .
      </p>
    </Scherm>
  );
}
