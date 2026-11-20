import type { LichtVariant } from "./StudioLicht";

/**
 * The look of the start screens (welkom, Thuis, later the prize ceremony).
 * `HUIDIG` is what is live now; A–D are the design variants to choose from.
 */
export type Ontwerp = {
  naam: string;
  /** Breathing studio lamps behind the screen. */
  licht: LichtVariant | null;
  /** The static sun rays from the prototype. */
  stralen: boolean;
  /** Lanes that hand their colours over to each other. */
  stroom: boolean;
  /** Glossy highlight on the lanes and the light cards (tv-studio decor). */
  glans: boolean;
  /** More room between the blocks. */
  ruim: boolean;
};

export const HUIDIG: Ontwerp = { naam: "Huidig", licht: null, stralen: true, stroom: false, glans: false, ruim: false };

export const ONTWERPEN = {
  a: { naam: "A · Studiolampen", licht: "lampen", stralen: true, stroom: true, glans: false, ruim: false },
  b: { naam: "B · Spotlights", licht: "spots", stralen: false, stroom: true, glans: false, ruim: false },
  c: { naam: "C · Zachte gloed, meer ruimte", licht: "gloed", stralen: false, stroom: true, glans: false, ruim: true },
  d: { naam: "D · Glimmende tv-studio", licht: "studio", stralen: true, stroom: true, glans: true, ruim: false },
} satisfies Record<string, Ontwerp>;

export type OntwerpSleutel = keyof typeof ONTWERPEN;
