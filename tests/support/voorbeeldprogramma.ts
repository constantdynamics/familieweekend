/**
 * The example program of SPEC §9.3, as the migration seeds it, for the unit
 * tests of the program and Thuis. All times are Amsterdam wall time in May 2027.
 */
import type { ProgramItem, ProgramKind } from "@/lib/shared/program";
import { fromAmsterdamWallTime } from "@/lib/shared/time";

export const START = "2027-05-06T12:00:00.000Z"; // do 6 mei 14:00
export const END = "2027-05-09T13:00:00.000Z"; // zo 9 mei 15:00

/** ISO instant for a moment on `day` May 2027, Amsterdam time. */
export function at(day: number, hour: number, minute = 0): string {
  return fromAmsterdamWallTime(2027, 5, day, hour, minute).toISOString();
}

let next = 0;

export function item(
  day: number,
  hour: number,
  minute: number,
  title: string,
  kind: ProgramKind = "gewoon",
  extra: Partial<ProgramItem> = {},
): ProgramItem {
  next += 1;
  return {
    id: `id-${next}`,
    startsAt: at(day, hour, minute),
    endsAt: null,
    title,
    subtitle: null,
    location: null,
    kind,
    sort: 1,
    ...extra,
  };
}

export const VOORBEELD: ProgramItem[] = [
  item(6, 14, 0, "Aankomst en kamers verdelen"),
  item(6, 17, 30, "Barbecue", "maaltijd"),
  item(6, 20, 0, "De Grote Valkenburger Quiz", "quiz", { subtitle: "5 rondes van 10 vragen, met een intermezzo" }),
  item(6, 22, 30, "Uitslag van de quiz"),
  item(7, 9, 30, "Ontbijt", "maaltijd"),
  item(7, 11, 0, "Wandelen langs de Dommel"),
  item(7, 14, 0, "Spelletjesmiddag", "vrijdag"),
  item(7, 18, 30, "Pizza-avond", "maaltijd"),
  item(8, 9, 0, "Ontbijt", "maaltijd"),
  item(8, 10, 30, "Zeskamp, spel 1 t/m 3", "zeskamp", { subtitle: "Het scorebord gaat op slot", location: "Op het grasveld" }),
  item(8, 12, 30, "Lunch", "maaltijd", { location: "In de grote tent" }),
  item(8, 14, 0, "Zeskamp, spel 4 t/m 6", "zeskamp", { subtitle: "Neem droge sokken mee" }),
  item(8, 18, 0, "Feestdiner", "maaltijd"),
  item(8, 20, 30, "Prijsuitreiking", "prijsuitreiking"),
  item(9, 9, 0, "Moederdagontbijt", "moederdag"),
  item(9, 11, 0, "Opruimen"),
  item(9, 13, 0, "Vertrek"),
];
