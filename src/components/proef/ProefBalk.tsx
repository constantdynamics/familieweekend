import Link from "next/link";
import { verlaatDeProef } from "@/app/beheer/proef/actions";
import { IconProef } from "@/components/ui/icons";
import { getRequestContext } from "@/lib/server/context";

const ROL = { familie: "familielid", captain: "captain", meekijker: "meekijker", spelleider: "spelleider" } as const;

/** Always visible in the test environment, so nobody mistakes it for the real thing. */
export async function ProefBalk() {
  const ctx = await getRequestContext();
  if (ctx.env !== "test") return null;
  const wie = ctx.viewAs
    ? `Je bekijkt de app als ${ROL[ctx.viewAs.role]}${ctx.captainTeam ? ` van ${ctx.captainTeam.name}` : ""}.`
    : ctx.captainTeam
      ? `Je bent captain van ${ctx.captainTeam.name}.`
      : "Alles wat je doet, telt niet voor de echte Spelen.";
  return (
    <div
      role="status"
      className="relative z-40 flex items-center gap-3 border-b-2 border-dashed border-mosterd bg-studio-diep px-4 py-2 text-[14px] leading-[1.35] text-beeldbuis"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <IconProef size={20} className="flex-none text-mosterd" />
      <p className="m-0 min-w-0 flex-1">
        <strong className="text-mosterd">Proef.</strong> {wie}
      </p>
      {ctx.isAdmin ? (
        <Link href="/beheer/proef" className="inline-flex min-h-11 items-center font-bold text-mosterd underline underline-offset-4">
          Proef
        </Link>
      ) : (
        <form action={verlaatDeProef}>
          <button type="submit" className="min-h-11 font-bold text-mosterd underline underline-offset-4">
            Stop
          </button>
        </form>
      )}
    </div>
  );
}
