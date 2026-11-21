import Link from "next/link";
import { IconQuiz, IconScore, IconZeskamp } from "@/components/ui/icons";
import type { Tile } from "@/lib/shared/home";
import { bijElkaar } from "@/lib/shared/tekst";

const ICONS = { quiz: IconQuiz, zeskamp: IconZeskamp, score: IconScore } as const;

/**
 * Quiz, Zeskamp and Score as tiles on Thuis, on the day they matter (the
 * owner's menu choice). Two side by side; a lone tile takes the full width.
 */
export function ThuisTegels({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return null;
  return (
    <nav aria-label="Vandaag in de app" className="grid grid-cols-2 gap-3">
      {tiles.map((tile, index) => {
        const Icon = ICONS[tile.key];
        const wide = tiles.length % 2 === 1 && index === tiles.length - 1;
        return (
          <Link
            key={tile.key}
            href={tile.href}
            className={`op-licht flex rounded-kaart bg-beeldbuis p-3.5 text-studio no-underline shadow-kaart hover:text-studio active:translate-y-0.5 ${
              wide ? "col-span-2 min-h-[76px] flex-row items-center gap-3" : "min-h-[124px] flex-col items-start gap-2"
            }`}
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd text-studio">
              <Icon size={22} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[18px] leading-tight font-extrabold">{tile.title}</span>
              <span className="text-label leading-[1.3]">{bijElkaar(tile.text, 0)}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
