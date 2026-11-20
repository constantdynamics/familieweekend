import type { ReactNode } from "react";
import { Bocht, Stralen } from "./Decor";

type Props = {
  children: ReactNode;
  /** Sun rays behind the start screen and the ceremony. */
  stralen?: boolean | "feest";
  /** Length of the zeskampbocht's vertical lanes. */
  bocht?: number;
  /** Keep room for the fixed tab bar. */
  metTabBalk?: boolean;
  /** Top padding before the content; the prototype uses 48–52 px. */
  boven?: number;
  className?: string;
};

/**
 * A full screen on the studio set: brown floor, the three lanes bending down
 * at the top right, and room for the status bar and the tab bar.
 */
export function Scherm({ children, stralen = false, bocht = 140, metTabBalk = true, boven = 50, className }: Props) {
  return (
    <div className="relative min-h-dvh overflow-x-clip veilig-boven">
      {stralen ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <Stralen top={stralen === "feest" ? -300 : -420} tint={stralen === "feest" ? "feest" : "zacht"} />
        </div>
      ) : null}
      <div className="relative mx-auto max-w-[560px]">
        <Bocht drop={bocht} />
        <main
          id="inhoud"
          className={`relative flex flex-col px-[22px] ${className ?? ""}`}
          style={{
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
