"use client";

import { IconDuim, IconHart } from "@/components/ui/icons";
import { aantal, type FeedPost } from "@/lib/shared/board";
import { useBoard } from "./board-context";

const KINDS = [
  { kind: "hart", Icon: IconHart, label: "Hartje", een: "hartje", meer: "hartjes", kleur: "text-roest" },
  { kind: "duim", Icon: IconDuim, label: "Duimpje", een: "duimpje", meer: "duimpjes", kleur: "text-studio" },
] as const;

/**
 * Hearts and thumbs, one of each per name. A tap shows at once (the board
 * sends it in the background); aria-pressed says whether you gave one.
 * Without a name you only see the counts.
 */
export function Reactions({ post }: { post: FeedPost }) {
  const board = useBoard();
  const reactor = board.reactor;
  return (
    <div className="flex items-center gap-2">
      {KINDS.map(({ kind, Icon, label, een, meer, kleur }) => {
        const count = kind === "hart" ? post.hearts : post.thumbs;
        if (!reactor) {
          if (count === 0) return null;
          return (
            <span key={kind} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-extrabold">
              <Icon size={20} className={kleur} fill="currentColor" />
              <span aria-hidden="true">{count}</span>{" "}
              <span className="sr-only">{aantal(count, een, meer)}</span>
            </span>
          );
        }
        const mine = (kind === "hart" ? post.myHearts : post.myThumbs).includes(reactor.id);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={mine}
            onClick={() => board.react(post.id, kind, !mine)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-pil border-2 border-studio px-3 text-[15px] font-extrabold ${
              mine ? "bg-mosterd" : "bg-transparent hover:bg-papier"
            }`}
          >
            <Icon size={20} className={mine ? kleur : undefined} fill={mine ? "currentColor" : "none"} />
            <span className="sr-only">{label}</span>
            {count > 0 ? (
              <>
                {" "}
                <span className="cijfers">{count}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
