const NBSP = " ";

/**
 * Keeps a short phrase on one line ("Borkel en Schaft"), so a line never
 * ends up with one lonely word. Longer text only keeps its last two words
 * together, which still avoids a single word on the last line.
 */
export function bijElkaar(tekst: string, max = 24): string {
  const schoon = tekst.trim().replace(/\s+/g, " ");
  if (schoon.length <= max) return schoon.replaceAll(" ", NBSP);
  const laatste = schoon.lastIndexOf(" ");
  return laatste === -1 ? schoon : `${schoon.slice(0, laatste)}${NBSP}${schoon.slice(laatste + 1)}`;
}
