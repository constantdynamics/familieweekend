import { IconProef, IconSlot } from "@/components/ui/icons";
import { IconMegafoon } from "@/components/ui/icons-prikbord";
import { Kaart } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import type { BoardNotice } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";

type Props = {
  notice: BoardNotice;
  /** Where "Kies je naam" brings you back to. */
  terug: string;
  /** The admin can still post as De spelleiding. */
  isAdmin?: boolean;
  /** Hearts and thumbs are allowed (in a channel of the spelleiding). */
  canReact?: boolean;
};

function Regel({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <p className="m-0 mt-4 flex items-start gap-3 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.45] text-beeldbuis">
      <span className="mt-0.5 flex-none text-mosterd">{icon}</span>
      <span>{bijElkaar(children)}</span>
    </p>
  );
}

/** Why this phone only reads along here, and what to do about it. */
export function Notice({ notice, terug, isAdmin = false, canReact = false }: Props) {
  const staffToo = isAdmin ? " Jij kunt als spelleiding nog wel plaatsen." : "";
  switch (notice) {
    case "geen-naam":
      return (
        <Kaart className="mt-4 flex flex-col gap-2.5">
          <h2 className="m-0 text-[19px] leading-tight font-extrabold">Kies je naam om mee te doen</h2>
          <p className="m-0 text-[15px] leading-[1.45]">
            {bijElkaar("Dan kun je berichten plaatsen en hartjes geven. Meelezen kan nu al.")}
          </p>
          <KnopLink href={`/wie-ben-jij?terug=${terug}`} size="klein" className="self-start">
            Kies je naam
          </KnopLink>
        </Kaart>
      );
    case "proef":
      return (
        <Regel icon={<IconProef size={20} />}>
          Je zit in de proef. Het prikbord is echt, dus hier lees je alleen mee.
        </Regel>
      );
    case "bekijk-als":
      return (
        <Regel icon={<IconProef size={20} />}>
          Je bekijkt de app als iemand anders. Op het prikbord lees je alleen mee.
        </Regel>
      );
    case "dicht":
      return <Regel icon={<IconSlot size={20} />}>{`Het prikbord is even dicht. Lezen kan wel.${staffToo}`}</Regel>;
    case "alleen-lezen":
      return <Regel icon={<IconSlot size={20} />}>{`Dit kanaal is alleen om te lezen.${staffToo}`}</Regel>;
    case "spelleiding":
      if (isAdmin) return null;
      return (
        <Regel icon={<IconMegafoon size={20} />}>
          {canReact
            ? "Hier plaatst alleen de spelleiding. Een hartje of duimpje geven mag wel!"
            : "Hier plaatst alleen de spelleiding."}
        </Regel>
      );
    default:
      return null;
  }
}
