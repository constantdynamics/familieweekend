import { IconOmlaag } from "@/components/ui/icons-zeskamp";
import type { ViewBreakdown, ViewStanding } from "@/lib/server/scoreboard";
import { placeText } from "@/lib/shared/zeskamp";
import { bijElkaar } from "@/lib/shared/tekst";
import { MEDAILLE_VLAK, Punten, TeamBalk } from "./Punten";

/**
 * The overall standings (SPEC §4.5): place with "gedeeld", the team colour,
 * name and total, and per team an expandable breakdown per part with the
 * jokers and the bonus points with their reason.
 */
export function Klassement({ rijen, label = "Klassement", nieuw }: { rijen: ViewStanding[]; label?: string; nieuw?: boolean }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rijen.map((rij) => (
        <KlassementRij key={rij.team.id} rij={rij} nieuw={nieuw} />
      ))}
    </ol>
  );
}

function KlassementRij({ rij, nieuw }: { rij: ViewStanding; nieuw?: boolean }) {
  return (
    <li className={`op-licht rounded-[18px] bg-beeldbuis text-studio shadow-tegel ${nieuw ? "motion-safe:animate-pop" : ""}`}>
      <details className="group">
        <summary className="flex min-h-[64px] cursor-pointer list-none items-center gap-3 rounded-[18px] py-2 pr-3 pl-1.5 [&::-webkit-details-marker]:hidden">
          <span className="flex w-[52px] flex-none flex-col items-center">
            {rij.place === null ? (
              <>
                <span aria-hidden="true" className="font-display text-[26px] leading-[1.05] blur-[6px] select-none">
                  8
                </span>
                <span className="sr-only">Plaats verborgen.</span>
              </>
            ) : (
              <>
                <span className="sr-only">Plaats </span>
                <span className="font-display text-[26px] leading-[1.05]">{rij.place}</span>
                {rij.shared ? <span className="text-klein font-bold">gedeeld</span> : null}
              </>
            )}
          </span>
          <TeamBalk kleur={rij.team.color} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(rij.team.name)}</span>
            {rij.summary ? <span className="text-[14px] leading-[1.35]">{rij.summary}</span> : null}
          </span>
          <Punten twelfths={rij.twelfths} className="font-display text-[30px] leading-none" />
          <IconOmlaag size={20} className="flex-none group-open:rotate-180" />
          <span className="sr-only">Tik voor de opbouw.</span>
        </summary>
        <Opbouw items={rij.breakdown} />
      </details>
    </li>
  );
}

function titel(item: ViewBreakdown): string {
  switch (item.kind) {
    case "zeskamp":
      return `${item.short}: ${item.name}`;
    case "vrijdag":
      return `Vrijdag: ${item.name}`;
    default:
      return item.name;
  }
}

function details(item: ViewBreakdown): string {
  const parts: string[] = [];
  if (item.place !== null) parts.push(item.shared ? `${placeText(item.place)}, gedeeld` : placeText(item.place));
  if (item.medal) parts.push(item.medal);
  if (item.joker) parts.push("met joker");
  return parts.join(", ");
}

export function Opbouw({ items }: { items: ViewBreakdown[] }) {
  return (
    <div className="border-t-2 border-papier-streep px-3.5 pt-1.5 pb-2.5">
      <h3 className="sr-only">Opbouw</h3>
      {items.length === 0 ? (
        <p className="m-0 py-1.5 text-[15px]">Nog geen punten.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item) => {
            const extra = details(item);
            return (
              <li key={item.partId} className="flex flex-col border-b border-papier-streep py-1.5 last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <span className="flex min-w-0 flex-1 flex-col text-[15px] leading-snug">
                    <span className="font-bold">{bijElkaar(titel(item))}</span>
                    {extra ? <span className="text-[13px]">{extra}</span> : null}
                  </span>
                  {item.medal ? (
                    <span aria-hidden="true" className={`h-5 w-5 flex-none rounded-pil border-2 border-studio ${MEDAILLE_VLAK[item.medal]}`} />
                  ) : null}
                  <Punten twelfths={item.twelfths} className="text-[17px] font-extrabold" />
                </div>
                {item.reasons.length > 0 ? (
                  <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 pl-3">
                    {item.reasons.map((reason, index) => (
                      <li key={index} className="flex items-baseline gap-2 text-[14px] leading-snug">
                        <span className="min-w-0 flex-1">{bijElkaar(reason.reason)}</span>
                        <Punten twelfths={reason.twelfths} plus className="font-bold" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
