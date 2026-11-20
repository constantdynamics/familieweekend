/**
 * Studio spotlights behind the start screens: soft, blurred beams from the
 * ceiling and a warm glow on the studio floor. They slowly breathe in and
 * out (bigger and brighter, then smaller and dimmer), each at its own pace.
 * Pure CSS (transform and opacity only), so it costs next to nothing; with
 * "reduce motion" they stand still.
 */

export type Lichtsterkte = "sterk" | "zacht";

type Spot = {
  /** RGB of the light. */
  rgb: string;
  /** Strength in the centre (0–1) at full strength. */
  sterkte: number;
  breedte: number;
  hoogte: number;
  /** Centre, as CSS lengths relative to the screen. */
  x: string;
  y: string;
  /** One breath in and out, in seconds. */
  duur: number;
  /** Where in the breath this spot starts, in seconds. */
  fase: number;
};

const MOSTERD = "245, 174, 27";
const ORANJE = "240, 106, 31";
const ROEST = "180, 68, 26";
const BEELDBUIS = "252, 235, 208";

const SPOTS: Spot[] = [
  { rgb: MOSTERD, sterkte: 0.32, breedte: 260, hoogte: 560, x: "16%", y: "120px", duur: 10, fase: 0 },
  { rgb: BEELDBUIS, sterkte: 0.13, breedte: 240, hoogte: 520, x: "52%", y: "70px", duur: 12, fase: 5 },
  { rgb: ORANJE, sterkte: 0.26, breedte: 260, hoogte: 560, x: "88%", y: "140px", duur: 11, fase: 3 },
  { rgb: ROEST, sterkte: 0.38, breedte: 760, hoogte: 300, x: "50%", y: "calc(100% - 60px)", duur: 13, fase: 7 },
];

/** The welcome screen may shine; on Thuis the lights stay in the background. */
const FACTOR: Record<Lichtsterkte, number> = { sterk: 1.3, zacht: 0.65 };

export function StudioLicht({ sterkte }: { sterkte: Lichtsterkte }) {
  const factor = FACTOR[sterkte];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {SPOTS.map((spot, index) => {
        const kern = Math.min(spot.sterkte * factor, 0.6).toFixed(3);
        const rand = Math.min(spot.sterkte * factor * 0.45, 0.3).toFixed(3);
        return (
          <span
            key={index}
            className="studio-lamp"
            style={{
              left: spot.x,
              top: spot.y,
              width: spot.breedte,
              height: spot.hoogte,
              background: `radial-gradient(closest-side, rgba(${spot.rgb}, ${kern}), rgba(${spot.rgb}, ${rand}) 45%, rgba(${spot.rgb}, 0))`,
              animationDuration: `${spot.duur}s`,
              animationDelay: `-${spot.fase}s`,
            }}
          />
        );
      })}
    </div>
  );
}
