import { IconSlot, IconVinkje } from "@/components/ui/icons";
import type { ViewJoker, ViewPart } from "@/lib/server/scoreboard";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatDayAndTime } from "@/lib/shared/time";

/** "Op slot tot de prijsuitreiking. Je ziet de stand van zaterdag 8 mei, 10:30." */
export function SlotMelding({ takenAt, beheerder = false }: { takenAt: string | null; beheerder?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-mosterd px-3.5 py-3 text-studio">
      <IconSlot size={26} strokeWidth={2.4} className="flex-none" />
      <p className="m-0 text-[15px] leading-[1.35] font-semibold">
        {beheerder
          ? bijElkaar("Het scorebord zit op slot tot de prijsuitreiking. Als beheerder zie jij de echte stand.")
          : takenAt
            ? `Op slot tot de prijsuitreiking. Je ziet de stand van ${formatDayAndTime(new Date(takenAt))}.`
            : bijElkaar("Op slot tot de prijsuitreiking.")}
      </p>
    </div>
  );
}

const STIJL: Record<ViewPart["status"], string> = {
  klaar: "bg-beeldbuis text-studio",
  bezig: "bg-oranje text-studio",
  gepland: "bg-studio-licht text-zand",
};

/** "Team Petrol bij spel 1, Team Oranje bij spel 2 en Team Mosterd bij de quiz (ronde 4)". */
export function jokerZin(jokers: readonly ViewJoker[]): string {
  const parts = jokers.map((joker) => `${joker.team.name} bij ${joker.label}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}`;
}

/**
 * While the lock is closed: which parts are played (a check mark, no
 * points) and which jokers were used (SPEC §4.5 "Slot").
 */
export function Gespeeld({ parts, jokers, titel }: { parts: ViewPart[]; jokers: ViewJoker[]; titel: string }) {
  return (
    <section aria-labelledby="gespeeld-titel" className="flex flex-col gap-2.5">
      <h2 id="gespeeld-titel" className="m-0 text-[15px] font-bold text-zand">
        {bijElkaar(titel)}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {parts.map((part) => {
          const gespeeld = part.status === "klaar" || (part.played && part.status !== "bezig");
          return (
            <li
              key={part.id}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-pil px-3 text-[14px] font-bold ${STIJL[gespeeld ? "klaar" : part.status]}`}
            >
              {gespeeld ? <IconVinkje size={16} strokeWidth={3} /> : null}
              {part.status === "bezig" ? `${part.short} bezig` : part.short}
              <span className="sr-only">{gespeeld ? ", gespeeld" : part.status === "bezig" ? "" : ", nog niet gespeeld"}</span>
            </li>
          );
        })}
      </ul>
      {jokers.length > 0 ? (
        <p className="m-0 text-[14px] leading-[1.4] text-zand">{bijElkaar(`Joker al gebruikt: ${jokerZin(jokers)}.`)}</p>
      ) : null}
    </section>
  );
}
