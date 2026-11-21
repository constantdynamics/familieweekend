import { TEAM_KLEUREN } from "@/components/team/TeamKleur";
import type { PodiumBlock } from "@/lib/server/ceremony";
import { bijElkaar } from "@/lib/shared/tekst";
import { MEDAILLE_VLAK, Punten } from "./Punten";

const HOOGTE: Record<number, number> = { 1: 136, 2: 96, 3: 66 };
/** Silver left, gold in the middle, bronze right. */
const VOLGORDE: Record<number, string> = { 1: "order-2", 2: "order-1", 3: "order-3" };
/** Bronze rises first, gold last. */
const WACHT: Record<number, string> = { 1: "320ms", 2: "160ms", 3: "0ms" };

const CSS = `
@keyframes valk-rijs { 0% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
.valk-rijs { transform-origin: bottom; animation: valk-rijs 650ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`;

/**
 * The podium that rises at the prize ceremony (SPEC §2): medals on top,
 * the team colour as the block. Shared places stand together on one block.
 */
export function Podium({ blokken }: { blokken: PodiumBlock[] }) {
  return (
    <>
      <style href="valk-podium" precedence="default">
        {CSS}
      </style>
      <ol aria-label="Podium" className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0">
        {[1, 2, 3].map((place) => {
          const blok = blokken.find((b) => b.place === place);
          if (!blok) return <li key={place} aria-hidden="true" className={VOLGORDE[place]} />;
          return (
            <li key={place} className={`flex min-w-0 flex-col items-center gap-1.5 ${VOLGORDE[place]}`}>
              <span
                className={`flex flex-none items-center justify-center rounded-pil font-extrabold text-studio ${MEDAILLE_VLAK[blok.medal]} ${
                  place === 1 ? "h-10 w-10 text-[17px] shadow-[0_0_0_4px_#2B1810,0_0_0_7px_#F2C14E]" : "h-[34px] w-[34px] text-[15px]"
                }`}
              >
                <span className="sr-only">Plaats </span>
                {place}
              </span>
              {blok.teams.map((rij) => (
                <span key={rij.team.id} className="text-center text-[15px] leading-tight font-extrabold">
                  {bijElkaar(rij.team.name)}
                </span>
              ))}
              <Punten twelfths={blok.teams[0]?.twelfths ?? 0} className="text-[14px] text-zand" />
              <div
                aria-hidden="true"
                className="valk-rijs flex w-full overflow-hidden rounded-t-[14px]"
                style={{ height: HOOGTE[place], animationDelay: WACHT[place] }}
              >
                {blok.teams.map((rij) => (
                  <span key={rij.team.id} className={`flex-1 ${TEAM_KLEUREN[rij.team.color].vlak}`} />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
