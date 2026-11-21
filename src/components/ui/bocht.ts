/**
 * The zeskampbocht: lanes that run in from the left along the top, bend
 * down at the top right and run along the right edge to the bottom of the
 * screen. Six on the welcome screen, one everywhere else, where room is
 * scarce. Shared by the still version (Decor.tsx) and the flowing one
 * (StromendeBocht.tsx), so both have exactly the same shape.
 *
 * The svg is 80 px wide, as tall as the screen column and anchored to its
 * right edge. The horizontal part is drawn outside its own box, so the
 * curve keeps its true shape at every screen width.
 */

/**
 * Six colours from the studio palette, from the outer lane inwards: the four
 * team colours (avocado and petrol in their light shade, so they show on
 * the brown floor) plus gold and rust. Each lane passes through all of them.
 */
export const BOCHT_KLEUREN = [
  "#F2C14E", // goud
  "#F5AE1B", // mosterd
  "#F06A1F", // oranje
  "#B4441A", // roest
  "#4FA3A5", // petrol, licht
  "#A7B43A", // avocado, licht
] as const;

export const KLEUREN = BOCHT_KLEUREN.length;
/** Six lanes on the welcome screen, one everywhere else. */
export type AantalBanen = 1 | 6;
/** Width of a lane: 4 px in the band of six (5 px apart, so 1 px floor between them), 6 px when it is alone. */
export function dikte(aantal: AantalBanen): number {
  return aantal === 1 ? 6 : 4;
}
const STAP = 5;
/** The outer lane runs 7 px from the top and 7 px from the right edge. */
const RAND = 7;
/** Radius of the outer lane's bend; each lane further in is 5 px tighter. */
const STRAAL = 60;
export const SVG_BREEDTE = 80;
/** Where every lane has turned the corner and runs straight down (px from the top). */
export const KNIK = RAND + STRAAL;
/**
 * Room the content keeps free on the right (px): up to the inner edge of
 * the innermost lane plus 8 px air, and never less than the 22 px on the
 * left. Text never runs into the lanes.
 */
export function banenRuimte(aantal: AantalBanen): number {
  return Math.max(22, RAND + (aantal - 1) * STAP + dikte(aantal) / 2 + 8);
}

/** The colour lane i starts with: gold outside in the band of six; a lane on its own starts in mustard. */
export function startKleur(aantal: AantalBanen, i: number): number {
  return (i + (aantal === 1 ? 1 : 0)) % KLEUREN;
}

export function baan(i: number) {
  return {
    /** The lane's height along the top. */
    y: RAND + i * STAP,
    /** Its x along the right edge, in svg coordinates. */
    x: SVG_BREEDTE - RAND - i * STAP,
    r: STRAAL - i * STAP,
  };
}

/** The top of lane i: from x = start along the top, around the corner, to the knik. */
export function bochtPad(i: number, start = -3000): string {
  const { y, x, r } = baan(i);
  return `M${start} ${y} H${x - r} A${r} ${r} 0 0 1 ${x} ${KNIK}`;
}

/** Length of that top part from x = start, in px. */
export function bochtLengte(i: number, start: number): number {
  const { x, r } = baan(i);
  return x - r - start + (Math.PI / 2) * r;
}
