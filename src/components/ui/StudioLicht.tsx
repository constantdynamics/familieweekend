/**
 * Warm studio lamps behind the start screen: soft light spots that slowly
 * breathe in and out (bigger and brighter, then smaller and dimmer).
 * Pure CSS (transform and opacity only), so it costs next to nothing; with
 * "reduce motion" they stand still.
 */

export type LichtVariant = "lampen" | "spots" | "gloed" | "studio";

type Lamp = {
  /** RGB of the light. */
  rgb: string;
  /** Strength in the centre (0–1). */
  sterkte: number;
  breedte: number;
  hoogte: number;
  /** Centre, as CSS lengths relative to the screen. */
  x: string;
  y: string;
  /** One breath in and out, in seconds. */
  duur: number;
  /** Where in the breath this lamp starts, in seconds. */
  fase: number;
};

const MOSTERD = "245, 174, 27";
const ORANJE = "240, 106, 31";
const ROEST = "180, 68, 26";
const BEELDBUIS = "252, 235, 208";

const VARIANTEN: Record<LichtVariant, Lamp[]> = {
  // A: four warm lamps spread around the set.
  lampen: [
    { rgb: MOSTERD, sterkte: 0.32, breedte: 420, hoogte: 420, x: "18%", y: "150px", duur: 11, fase: 0 },
    { rgb: ORANJE, sterkte: 0.27, breedte: 480, hoogte: 480, x: "96%", y: "430px", duur: 13, fase: 4 },
    { rgb: ROEST, sterkte: 0.32, breedte: 460, hoogte: 460, x: "4%", y: "760px", duur: 12, fase: 8 },
    { rgb: BEELDBUIS, sterkte: 0.11, breedte: 300, hoogte: 300, x: "78%", y: "980px", duur: 10, fase: 2 },
  ],
  // B: spotlights from the ceiling and a warm glow on the studio floor.
  spots: [
    { rgb: MOSTERD, sterkte: 0.32, breedte: 260, hoogte: 560, x: "16%", y: "120px", duur: 10, fase: 0 },
    { rgb: BEELDBUIS, sterkte: 0.13, breedte: 240, hoogte: 520, x: "52%", y: "70px", duur: 12, fase: 5 },
    { rgb: ORANJE, sterkte: 0.26, breedte: 260, hoogte: 560, x: "88%", y: "140px", duur: 11, fase: 3 },
    { rgb: ROEST, sterkte: 0.38, breedte: 760, hoogte: 300, x: "50%", y: "calc(100% - 60px)", duur: 13, fase: 7 },
  ],
  // C: one big, calm glow behind the name, two small accents.
  gloed: [
    { rgb: ORANJE, sterkte: 0.32, breedte: 620, hoogte: 620, x: "38%", y: "250px", duur: 13, fase: 0 },
    { rgb: MOSTERD, sterkte: 0.19, breedte: 300, hoogte: 300, x: "92%", y: "620px", duur: 10, fase: 3 },
    { rgb: ROEST, sterkte: 0.26, breedte: 380, hoogte: 380, x: "8%", y: "900px", duur: 11, fase: 6 },
  ],
  // D: the full tv studio: lamps plus a soft spotlight on the countdown.
  studio: [
    { rgb: MOSTERD, sterkte: 0.29, breedte: 400, hoogte: 400, x: "20%", y: "140px", duur: 11, fase: 0 },
    { rgb: BEELDBUIS, sterkte: 0.14, breedte: 520, hoogte: 360, x: "50%", y: "560px", duur: 12, fase: 6 },
    { rgb: ORANJE, sterkte: 0.24, breedte: 440, hoogte: 440, x: "98%", y: "360px", duur: 13, fase: 3 },
    { rgb: ROEST, sterkte: 0.32, breedte: 460, hoogte: 460, x: "2%", y: "900px", duur: 12, fase: 9 },
  ],
};

export function StudioLicht({ variant }: { variant: LichtVariant }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {VARIANTEN[variant].map((lamp, index) => (
        <span
          key={index}
          className="studio-lamp"
          style={{
            left: lamp.x,
            top: lamp.y,
            width: lamp.breedte,
            height: lamp.hoogte,
            background: `radial-gradient(closest-side, rgba(${lamp.rgb}, ${lamp.sterkte}), rgba(${lamp.rgb}, ${lamp.sterkte * 0.45}) 45%, rgba(${lamp.rgb}, 0))`,
            animationDuration: `${lamp.duur}s`,
            animationDelay: `-${lamp.fase}s`,
          }}
        />
      ))}
    </div>
  );
}
