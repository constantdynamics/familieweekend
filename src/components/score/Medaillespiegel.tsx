import type { ViewMedal } from "@/lib/server/scoreboard";
import type { Medal } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { MEDAILLE_VLAK, TeamBalk } from "./Punten";

/**
 * The medal table (SPEC §4.5): per team gold, silver and bronze, sorted as
 * at the Olympic Games. A real table, so screen readers can read it.
 */
export function Medaillespiegel({ rijen }: { rijen: ViewMedal[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[14px] leading-[1.4] text-zand">{bijElkaar("Per onderdeel goud, zilver en brons.")}</p>
      <table className="w-full border-separate border-spacing-y-2.5 text-studio">
        <caption className="sr-only">Medaillespiegel: per team het aantal keer goud, zilver en brons</caption>
        <thead>
          <tr className="text-klein text-zand">
            <th scope="col" className="px-3.5 text-left font-medium">
              <span className="sr-only">Team</span>
            </th>
            <th scope="col" className="w-12 font-medium">
              goud
            </th>
            <th scope="col" className="w-12 font-medium">
              zilver
            </th>
            <th scope="col" className="w-[60px] pr-3.5 font-medium">
              brons
            </th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((rij) => (
            <tr key={rij.team.id}>
              <th scope="row" className="rounded-l-[18px] bg-beeldbuis py-2 pl-3.5 text-left font-normal shadow-tegel">
                <span className="flex items-center gap-2.5">
                  <TeamBalk kleur={rij.team.color} className="h-9" />
                  <span className="text-[17px] leading-tight font-extrabold">{bijElkaar(rij.team.name)}</span>
                </span>
              </th>
              <Cel soort="goud" aantal={rij.gold} />
              <Cel soort="zilver" aantal={rij.silver} />
              <Cel soort="brons" aantal={rij.bronze} laatste />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 text-[14px] leading-[1.4] text-zand">
        {bijElkaar("Gedeelde plaats betekent gedeeld metaal: allebei goud, en dan geen zilver.")}
      </p>
    </div>
  );
}

function Cel({ soort, aantal, laatste }: { soort: Medal; aantal: number | null; laatste?: boolean }) {
  return (
    <td className={`bg-beeldbuis py-2 text-center shadow-tegel ${laatste ? "rounded-r-[18px] pr-3.5" : ""}`}>
      <span
        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-pil text-[16px] font-extrabold text-studio cijfers ${MEDAILLE_VLAK[soort]}`}
      >
        {aantal === null ? (
          <>
            <span aria-hidden="true" className="blur-[5px] select-none">
              8
            </span>
            <span className="sr-only">verborgen</span>
          </>
        ) : (
          aantal
        )}
      </span>
    </td>
  );
}
