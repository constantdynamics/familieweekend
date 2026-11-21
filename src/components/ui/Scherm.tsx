import type { ReactNode } from "react";
import { type AantalBanen, banenRuimte } from "./bocht";
import { Bocht, Stralen } from "./Decor";
import { StromendeBocht } from "./StromendeBocht";
import { type Lichtsterkte, StudioLicht } from "./StudioLicht";

type Props = {
  children: ReactNode;
  /** Sun rays behind the screen. */
  stralen?: boolean | "feest";
  /**
   * The calm studio set of welkom, Thuis and the prize ceremony: breathing
   * spotlights, and lanes that hand their colours over to each other.
   */
  spots?: Lichtsterkte;
  /** Six lanes on the welcome screen; one everywhere else, where room is scarce. */
  banen?: AantalBanen;
  /** Keep room for the fixed tab bar. */
  metTabBalk?: boolean;
  /** Top padding before the content; the prototype uses 48–52 px. */
  boven?: number;
  className?: string;
};

/**
 * A full screen on the studio set: brown floor, the lanes that bend down at
 * the top right and run along the right edge to the bottom, and room for
 * the status bar and the tab bar. The content keeps clear of the lanes.
 */
export function Scherm({ children, stralen = false, spots, banen = 1, metTabBalk = true, boven = 50, className }: Props) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip veilig-boven">
      {stralen ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <Stralen top={stralen === "feest" ? -300 : -420} tint={stralen === "feest" ? "feest" : "zacht"} />
        </div>
      ) : null}
      {spots ? <StudioLicht sterkte={spots} /> : null}
      <div className="relative mx-auto w-full max-w-[560px] flex-1">
        {spots ? <StromendeBocht banen={banen} /> : <Bocht banen={banen} />}
        <main
          id="inhoud"
          className={`relative flex flex-col pl-[22px] ${className ?? ""}`}
          style={{
            paddingRight: banenRuimte(banen),
            paddingTop: boven,
            paddingBottom: metTabBalk ? "calc(80px + env(safe-area-inset-bottom, 0px) + 28px)" : 32,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
