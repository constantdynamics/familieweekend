import { type AantalBanen, BOCHT_KLEUREN, KNIK, SVG_BREEDTE, baan, bochtPad, dikte, startKleur } from "./bocht";

/**
 * The studio set: the "zeskampbocht" (lanes that run along the top, bend
 * down at the top right and run to the bottom of the screen) and the
 * subtle sun rays behind the start screen and the ceremony.
 */

/** The still zeskampbocht, for every screen without the spotlights. The shape lives in bocht.ts. */
export function Bocht({ banen = 1 }: { banen?: AantalBanen }) {
  return (
    <svg
      aria-hidden="true"
      width={SVG_BREEDTE}
      className="pointer-events-none absolute top-0 right-0 h-full overflow-visible"
    >
      {Array.from({ length: banen }, (_, i) => {
        const { x } = baan(i);
        return (
          <g key={i} fill="none" stroke={BOCHT_KLEUREN[startKleur(banen, i)]} strokeWidth={dikte(banen)}>
            <path d={bochtPad(i)} strokeLinecap="round" />
            <line x1={x} y1={KNIK} x2={x} y2="100%" />
          </g>
        );
      })}
    </svg>
  );
}

type StralenProps = {
  /** Vertical offset of the ray circle; the prototype uses -420 (home) and -300 (ceremony). */
  top?: number;
  tint?: "zacht" | "feest";
};

export function Stralen({ top = -420, tint = "zacht" }: StralenProps) {
  return (
    <div
      aria-hidden="true"
      className="zonnestralen pointer-events-none absolute left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full"
      style={{
        top,
        ...(tint === "feest"
          ? {
              background:
                "repeating-conic-gradient(from 0deg, #3D2413 0deg 7deg, #2B1810 7deg 14deg)",
            }
          : null),
      }}
    />
  );
}
