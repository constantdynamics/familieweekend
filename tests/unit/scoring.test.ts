import { describe, expect, it } from "vitest";
import { quizTotals } from "@/lib/shared/quizScoring";
import {
  DEFAULT_PLACE_TABLE,
  eventMedals,
  formatPoints,
  medalForPlace,
  medalTable,
  pointsToTwelfths,
  rankResults,
  standings,
  type Placement,
  type ResultType,
  type ScoreEvent,
  type TeamResult,
} from "@/lib/shared/scoring";

const TEAMS = ["Oranje", "Mosterd", "Avocado", "Petrol"];

/** Whole or half points to twelfths, for readable test data. */
const p = (points: number) => points * 12;

/** Results in the order Oranje, Mosterd, Avocado, Petrol. */
function results(values: Record<string, number | null>): TeamResult[] {
  return Object.entries(values).map(([team, value]) => ({ team, value }));
}

/** A zeskamp game as the server stores it: points and places per team. */
function game(id: string, placements: Placement[]): ScoreEvent {
  return {
    id,
    kind: "zeskamp",
    countsForMedals: true,
    points: Object.fromEntries(placements.map((row) => [row.team, row.twelfths])),
    places: Object.fromEntries(placements.map((row) => [row.team, row.place])),
    jokerTeams: placements.filter((row) => row.joker).map((row) => row.team),
  };
}

/** "1 Petrol 20 joker", like the table in SPEC §5.5. */
function lines(placements: Placement[]): string[] {
  return placements.map((row) =>
    [row.place ?? "-", row.team, formatPoints(row.twelfths), row.shared && "gedeeld", row.joker && "joker"]
      .filter(Boolean)
      .join(" "),
  );
}

// SPEC §5.5, the numbers of the prototype.

/** Quiz points per round; Mosterd plays its joker in round 4 (5 → 10). */
const QUIZ_PER_ROUND: Record<string, number[]> = {
  Oranje: [8, 7, 9, 6, 8],
  Mosterd: [7, 8, 6, 5, 10],
  Avocado: [6, 7, 7, 6, 7],
  Petrol: [8, 6, 7, 8, 7],
};
const QUIZ_TOTALS = quizTotals(
  [1, 2, 3, 4, 5].map((round) => ({
    round,
    points: Object.fromEntries(TEAMS.map((team) => [team, p(QUIZ_PER_ROUND[team][round - 1])])),
  })),
  { Mosterd: 4 },
);
const QUIZ: ScoreEvent = {
  id: "quiz",
  kind: "quiz",
  countsForMedals: true,
  points: Object.fromEntries(TEAMS.map((team) => [team, QUIZ_TOTALS[team].twelfths])),
  jokerTeams: TEAMS.filter((team) => QUIZ_TOTALS[team].jokerRound !== null),
};
const VRIJDAG: ScoreEvent = {
  id: "vrijdag",
  kind: "vrijdag",
  countsForMedals: true,
  points: { Oranje: p(8), Mosterd: p(5), Avocado: p(10), Petrol: p(6) },
};

/** The six zeskamp games with raw results that give the placements of §5.5. */
const ZESKAMP: { id: string; type: ResultType; joker: string | null; values: Record<string, number> }[] = [
  // Seconds; Petrol plays its joker.
  { id: "spel-1", type: "tijd", joker: "Petrol", values: { Oranje: 44.87, Mosterd: 43.05, Avocado: 52.1, Petrol: 41.2 } },
  // Balls in the bucket; Oranje plays its joker.
  { id: "spel-2", type: "aantal_hoog", joker: "Oranje", values: { Oranje: 14, Mosterd: 9, Avocado: 11, Petrol: 6 } },
  // Tower height in cm; Mosterd and Avocado are equally high.
  { id: "spel-3", type: "meting_hoog", joker: null, values: { Oranje: 120, Mosterd: 142, Avocado: 142, Petrol: 97 } },
  // Grams between the biggest and the smallest piece of cake.
  { id: "spel-4", type: "meting_laag", joker: null, values: { Oranje: 18, Mosterd: 40, Avocado: 12, Petrol: 25 } },
  // The referee taps the order; Mosterd plays its joker.
  { id: "spel-5", type: "plaatsen", joker: "Mosterd", values: { Oranje: 3, Mosterd: 1, Avocado: 4, Petrol: 2 } },
  // Jury marks; Avocado plays its joker.
  { id: "spel-6", type: "jury", joker: "Avocado", values: { Oranje: 9, Mosterd: 8, Avocado: 7, Petrol: 5 } },
];
const PLACEMENTS = ZESKAMP.map((spel) => rankResults(results(spel.values), spel.type, { joker: spel.joker }));
const GAMES = ZESKAMP.map((spel, index) => game(spel.id, PLACEMENTS[index]));
const WEEKEND = [QUIZ, VRIJDAG, ...GAMES];

describe("§5.5 stand na vrijdag", () => {
  it("telt de quiz met de joker van Mosterd", () => {
    expect(TEAMS.map((team) => formatPoints(QUIZ_TOTALS[team].twelfths))).toEqual(["38", "41", "33", "36"]);
    expect(QUIZ_TOTALS.Mosterd.rounds[3]).toEqual({ round: 4, base: p(5), twelfths: p(10), joker: true });
    expect(QUIZ.jokerTeams).toEqual(["Mosterd"]);
  });

  it("zet Oranje en Mosterd gedeeld op 1 met 46, Avocado 3e met 43 en Petrol 4e met 42", () => {
    const rows = standings(TEAMS, [QUIZ, VRIJDAG]);
    expect(rows.map(({ team, place, shared, twelfths }) => ({ team, place, shared, twelfths }))).toEqual([
      { team: "Oranje", place: 1, shared: true, twelfths: p(46) },
      { team: "Mosterd", place: 1, shared: true, twelfths: p(46) },
      { team: "Avocado", place: 3, shared: false, twelfths: p(43) },
      { team: "Petrol", place: 4, shared: false, twelfths: p(42) },
    ]);
  });
});

describe("§5.5 zeskamp", () => {
  it("spel 1: Petrol 1e met joker (20), Mosterd 7, Oranje 5, Avocado 3", () => {
    expect(lines(PLACEMENTS[0])).toEqual(["1 Petrol 20 joker", "2 Mosterd 7", "3 Oranje 5", "4 Avocado 3"]);
  });

  it("spel 2: Oranje 1e met joker (20), Avocado 7, Mosterd 5, Petrol 3", () => {
    expect(lines(PLACEMENTS[1])).toEqual(["1 Oranje 20 joker", "2 Avocado 7", "3 Mosterd 5", "4 Petrol 3"]);
  });

  it("spel 3: Mosterd en Avocado gedeeld 1e met elk 8,5, Oranje 3e (5), Petrol 4e (3)", () => {
    expect(PLACEMENTS[2]).toEqual([
      { team: "Mosterd", place: 1, shared: true, twelfths: 102, joker: false },
      { team: "Avocado", place: 1, shared: true, twelfths: 102, joker: false },
      { team: "Oranje", place: 3, shared: false, twelfths: 60, joker: false },
      { team: "Petrol", place: 4, shared: false, twelfths: 36, joker: false },
    ]);
    expect(lines(PLACEMENTS[2])).toEqual(["1 Mosterd 8,5 gedeeld", "1 Avocado 8,5 gedeeld", "3 Oranje 5", "4 Petrol 3"]);
  });

  it("spel 4: Avocado 10, Oranje 7, Petrol 5, Mosterd 3", () => {
    expect(lines(PLACEMENTS[3])).toEqual(["1 Avocado 10", "2 Oranje 7", "3 Petrol 5", "4 Mosterd 3"]);
  });

  it("spel 5: Mosterd 1e met joker (20), Petrol 7, Oranje 5, Avocado 3", () => {
    expect(lines(PLACEMENTS[4])).toEqual(["1 Mosterd 20 joker", "2 Petrol 7", "3 Oranje 5", "4 Avocado 3"]);
  });

  it("spel 6: Oranje 10, Mosterd 7, Avocado 3e met joker (10), Petrol 3", () => {
    expect(lines(PLACEMENTS[5])).toEqual(["1 Oranje 10", "2 Mosterd 7", "3 Avocado 10 joker", "4 Petrol 3"]);
  });

  it("telt de zeskamp op tot Oranje 52, Mosterd 50,5, Avocado 41,5, Petrol 41", () => {
    const rows = standings(TEAMS, GAMES);
    expect(rows.map((row) => [row.team, formatPoints(row.twelfths)])).toEqual([
      ["Oranje", "52"],
      ["Mosterd", "50,5"],
      ["Avocado", "41,5"],
      ["Petrol", "41"],
    ]);
    expect(rows.map((row) => row.twelfths)).toEqual([624, 606, 498, 492]);
  });
});

describe("§5.5 eindstand en medaillespiegel", () => {
  it("eindigt met 1 Oranje 98, 2 Mosterd 96,5, 3 Avocado 84,5, 4 Petrol 83", () => {
    const rows = standings(TEAMS, WEEKEND);
    expect(rows.map((row) => [row.place, row.team, formatPoints(row.twelfths), row.shared])).toEqual([
      [1, "Oranje", "98", false],
      [2, "Mosterd", "96,5", false],
      [3, "Avocado", "84,5", false],
      [4, "Petrol", "83", false],
    ]);
    expect(rows.map((row) => row.twelfths)).toEqual([1176, 1158, 1014, 996]);
  });

  it("geeft de opbouw per onderdeel met de jokers gemarkeerd", () => {
    const mosterd = standings(TEAMS, WEEKEND).find((row) => row.team === "Mosterd");
    expect(mosterd?.breakdown).toEqual([
      { eventId: "quiz", kind: "quiz", twelfths: p(41), joker: true },
      { eventId: "vrijdag", kind: "vrijdag", twelfths: p(5), joker: false },
      { eventId: "spel-1", kind: "zeskamp", twelfths: p(7), joker: false },
      { eventId: "spel-2", kind: "zeskamp", twelfths: p(5), joker: false },
      { eventId: "spel-3", kind: "zeskamp", twelfths: p(8.5), joker: false },
      { eventId: "spel-4", kind: "zeskamp", twelfths: p(3), joker: false },
      { eventId: "spel-5", kind: "zeskamp", twelfths: p(20), joker: true },
      { eventId: "spel-6", kind: "zeskamp", twelfths: p(7), joker: false },
    ]);
    const jokers = standings(TEAMS, WEEKEND).map((row) => [
      row.team,
      row.breakdown.filter((score) => score.joker).map((score) => score.eventId),
    ]);
    expect(jokers).toEqual([
      ["Oranje", ["spel-2"]],
      ["Mosterd", ["quiz", "spel-5"]],
      ["Avocado", ["spel-6"]],
      ["Petrol", ["spel-1"]],
    ]);
  });

  it("maakt de medaillespiegel: Mosterd 3-2-1, Avocado 3-1-1, Oranje 2-3-3, Petrol 1-1-3", () => {
    expect(medalTable(TEAMS, WEEKEND)).toEqual([
      { team: "Mosterd", gold: 3, silver: 2, bronze: 1, place: 1, shared: false },
      { team: "Avocado", gold: 3, silver: 1, bronze: 1, place: 2, shared: false },
      { team: "Oranje", gold: 2, silver: 3, bronze: 3, place: 3, shared: false },
      { team: "Petrol", gold: 1, silver: 1, bronze: 3, place: 4, shared: false },
    ]);
    // Mosterd wint de medaillespiegel, Oranje wint de Spelen.
    expect(medalTable(TEAMS, WEEKEND)[0].team).toBe("Mosterd");
    expect(standings(TEAMS, WEEKEND)[0].team).toBe("Oranje");
  });

  it("geeft medailles in de quiz en op vrijdag op punten, met de joker", () => {
    expect(eventMedals(QUIZ, TEAMS)).toEqual({ Oranje: "zilver", Mosterd: "goud", Avocado: null, Petrol: "brons" });
    expect(eventMedals(VRIJDAG, TEAMS)).toEqual({ Oranje: "zilver", Mosterd: null, Avocado: "goud", Petrol: "brons" });
  });

  it("geeft medailles in de zeskamp op plaats: Avocado heeft in spel 6 met joker 10 punten maar wordt 3e, dus brons", () => {
    expect(eventMedals(GAMES[5], TEAMS)).toEqual({ Oranje: "goud", Mosterd: "zilver", Avocado: "brons", Petrol: null });
    // Op punten zouden Oranje en Avocado allebei goud krijgen; daarom tellen de plaatsen.
    const onPoints = { ...GAMES[5], places: undefined };
    expect(eventMedals(onPoints, TEAMS)).toEqual({ Oranje: "goud", Mosterd: "brons", Avocado: "goud", Petrol: null });
  });

  it("geeft bij twee keer goud geen zilver, en brons aan de derde (spel 3)", () => {
    expect(eventMedals(GAMES[2], TEAMS)).toEqual({ Oranje: "brons", Mosterd: "goud", Avocado: "goud", Petrol: null });
  });
});

describe("§5.5 andere tests", () => {
  it("drie teams gedeeld eerste krijgen elk (10 + 7 + 5) / 3 = 7⅓, getoond als 7,3", () => {
    const rows = rankResults(results({ Oranje: 12, Mosterd: 12, Avocado: 12, Petrol: 9 }), "aantal_hoog");
    expect(rows).toEqual([
      { team: "Oranje", place: 1, shared: true, twelfths: 88, joker: false },
      { team: "Mosterd", place: 1, shared: true, twelfths: 88, joker: false },
      { team: "Avocado", place: 1, shared: true, twelfths: 88, joker: false },
      { team: "Petrol", place: 4, shared: false, twelfths: 36, joker: false },
    ]);
    expect(lines(rows)).toEqual(["1 Oranje 7,3 gedeeld", "1 Mosterd 7,3 gedeeld", "1 Avocado 7,3 gedeeld", "4 Petrol 3"]);
    // Shared points add up to exactly the places they took: no rounding inside.
    expect(rows.reduce((sum, row) => sum + row.twelfths, 0)).toBe(p(10 + 7 + 5 + 3));
    // Three golds and a fourth place without bronze.
    expect(rows.map((row) => medalForPlace(row.place))).toEqual(["goud", "goud", "goud", null]);
  });

  it("rekent een correctie na het slot door en laat de momentopname van het slot ongemoeid", () => {
    // Het slot gaat dicht bij de start van spel 1: momentopname van de stand na vrijdag.
    const vrijdagPoints: Record<string, number> = { ...VRIJDAG.points };
    const vrijdag: ScoreEvent = { ...VRIJDAG, points: vrijdagPoints };
    const snapshot = { standings: standings(TEAMS, [QUIZ, vrijdag]), medals: medalTable(TEAMS, [QUIZ, vrijdag]) };
    const copy = structuredClone(snapshot);

    // Na het slot: de toren van Avocado in spel 3 blijkt 140 cm, niet 142.
    const spel3 = game(
      "spel-3",
      rankResults(results({ Oranje: 120, Mosterd: 142, Avocado: 140, Petrol: 97 }), "meting_hoog"),
    );
    // En de beheerder verbetert de vrijdagpunten van Petrol van 6 naar 7, in hetzelfde object.
    vrijdagPoints.Petrol = p(7);
    const corrected = [QUIZ, vrijdag, GAMES[0], GAMES[1], spel3, ...GAMES.slice(3)];

    expect(standings(TEAMS, corrected).map((row) => [row.place, row.team, formatPoints(row.twelfths), row.shared])).toEqual([
      [1, "Oranje", "98", true],
      [1, "Mosterd", "98", true],
      [3, "Petrol", "84", false],
      [4, "Avocado", "83", false],
    ]);
    expect(medalTable(TEAMS, corrected).map((row) => [row.team, row.gold, row.silver, row.bronze])).toEqual([
      ["Mosterd", 3, 2, 1],
      ["Oranje", 2, 3, 3],
      ["Avocado", 2, 2, 1],
      ["Petrol", 1, 1, 3],
    ]);

    // De momentopname is niet meegeschoven.
    expect(snapshot).toEqual(copy);
    expect(snapshot.standings.map((row) => formatPoints(row.twelfths))).toEqual(["46", "46", "43", "42"]);
  });

  it("trekt losse punten af met een negatief getal, ook onder nul", () => {
    const los: ScoreEvent = { id: "los", kind: "los", countsForMedals: false, points: { Petrol: pointsToTwelfths(-2) } };
    const petrol = standings(TEAMS, [...WEEKEND, los]).find((row) => row.team === "Petrol");
    expect(petrol?.twelfths).toBe(p(81));
    expect(petrol?.breakdown.at(-1)).toEqual({ eventId: "los", kind: "los", twelfths: -24, joker: false });
    expect(formatPoints(-24)).toBe("-2");
    // Losse punten geven geen medailles.
    expect(medalTable(TEAMS, [...WEEKEND, los])).toEqual(medalTable(TEAMS, WEEKEND));

    const below = standings(["Oranje", "Petrol"], [{ ...los, points: { Petrol: p(-2.5) } }]);
    expect(below.map((row) => [row.place, row.team, formatPoints(row.twelfths)])).toEqual([
      [1, "Oranje", "0"],
      [2, "Petrol", "-2,5"],
    ]);
  });
});

describe("plaatspunten per uitslagtype", () => {
  const cases: [ResultType, Record<string, number>, string[]][] = [
    ["tijd", { Oranje: 61.5, Mosterd: 58.25, Avocado: 75, Petrol: 59.9 }, ["Mosterd", "Petrol", "Oranje", "Avocado"]],
    ["aantal_hoog", { Oranje: 3, Mosterd: 8, Avocado: 5, Petrol: 0 }, ["Mosterd", "Avocado", "Oranje", "Petrol"]],
    ["meting_hoog", { Oranje: 31, Mosterd: 12.5, Avocado: 40.5, Petrol: 22 }, ["Avocado", "Oranje", "Petrol", "Mosterd"]],
    ["meting_laag", { Oranje: 31, Mosterd: 12.5, Avocado: 40.5, Petrol: 22 }, ["Mosterd", "Petrol", "Oranje", "Avocado"]],
    ["jury", { Oranje: 6, Mosterd: 9, Avocado: 7.5, Petrol: 8 }, ["Mosterd", "Petrol", "Avocado", "Oranje"]],
  ];

  it.each(cases)("%s: de goede kant wint", (type, values, order) => {
    const rows = rankResults(results(values), type);
    expect(rows.map((row) => row.team)).toEqual(order);
    expect(rows.map((row) => row.twelfths)).toEqual([p(10), p(7), p(5), p(3)]);
    expect(rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
  });

  it("aantal_laag (omgekeerd uitbeelden): wie het minst raadt, wint", () => {
    const rows = rankResults(results({ Oranje: 7, Mosterd: 2, Avocado: 4, Petrol: 2 }), "aantal_laag");
    expect(lines(rows)).toEqual(["1 Mosterd 8,5 gedeeld", "1 Petrol 8,5 gedeeld", "3 Avocado 5", "4 Oranje 3"]);
  });

  it("plaatsen: de aangetikte plaats telt, gelijke plaatsen delen (7 + 5) / 2 = 6 en de volgende is 4e", () => {
    const rows = rankResults(results({ Oranje: 2, Mosterd: 1, Avocado: 2, Petrol: 3 }), "plaatsen");
    expect(rows).toEqual([
      { team: "Mosterd", place: 1, shared: false, twelfths: p(10), joker: false },
      { team: "Oranje", place: 2, shared: true, twelfths: p(6), joker: false },
      { team: "Avocado", place: 2, shared: true, twelfths: p(6), joker: false },
      { team: "Petrol", place: 4, shared: false, twelfths: p(3), joker: false },
    ]);
  });

  it("jury: gelijke cijfers delen de plaats", () => {
    const rows = rankResults(results({ Oranje: 7, Mosterd: 9, Avocado: 8, Petrol: 8 }), "jury");
    expect(lines(rows)).toEqual(["1 Mosterd 10", "2 Avocado 6 gedeeld", "2 Petrol 6 gedeeld", "4 Oranje 3"]);
  });

  it("vier teams gelijk krijgen elk 6¼, getoond als 6,3", () => {
    const rows = rankResults(results({ Oranje: 30, Mosterd: 30, Avocado: 30, Petrol: 30 }), "tijd");
    expect(rows.map((row) => [row.place, row.twelfths, row.shared])).toEqual([
      [1, 75, true],
      [1, 75, true],
      [1, 75, true],
      [1, 75, true],
    ]);
    expect(formatPoints(75)).toBe("6,3");
  });

  it("de joker verdubbelt de gedeelde punten", () => {
    const rows = rankResults(results({ Oranje: 12, Mosterd: 12, Avocado: 12, Petrol: 9 }), "aantal_hoog", {
      joker: "Mosterd",
    });
    expect(lines(rows)).toEqual([
      "1 Oranje 7,3 gedeeld",
      "1 Mosterd 14,7 gedeeld joker",
      "1 Avocado 7,3 gedeeld",
      "4 Petrol 3",
    ]);
    expect(rows[1].twelfths).toBe(176);
    const second = rankResults(results({ Oranje: 1, Mosterd: 2, Avocado: 2, Petrol: 4 }), "plaatsen", { joker: "Avocado" });
    expect(lines(second)).toEqual(["1 Oranje 10", "2 Mosterd 6 gedeeld", "2 Avocado 12 gedeeld joker", "4 Petrol 3"]);
  });

  it("geeft een team zonder uitslag geen plaats en 0 punten, onderaan", () => {
    const rows = rankResults(
      [
        { team: "Oranje", value: 10 },
        { team: "Mosterd", value: null },
        { team: "Avocado", value: 12 },
        { team: "Petrol", value: Number.NaN },
      ],
      "aantal_hoog",
      { joker: "Mosterd" },
    );
    expect(rows).toEqual([
      { team: "Avocado", place: 1, shared: false, twelfths: p(10), joker: false },
      { team: "Oranje", place: 2, shared: false, twelfths: p(7), joker: false },
      { team: "Mosterd", place: null, shared: false, twelfths: 0, joker: true },
      { team: "Petrol", place: null, shared: false, twelfths: 0, joker: false },
    ]);
    expect(rankResults([{ team: "Oranje", value: null }], "tijd")).toEqual([
      { team: "Oranje", place: null, shared: false, twelfths: 0, joker: false },
    ]);
    expect(rankResults([], "tijd")).toEqual([]);
  });

  it("geeft plaatsen buiten de tabel 0 punten, ook gedeeld", () => {
    const five = results({ A: 1, B: 2, C: 3, D: 4, E: 5 });
    expect(rankResults(five, "plaatsen").map((row) => row.twelfths)).toEqual([p(10), p(7), p(5), p(3), 0]);
    const tiedLast = results({ A: 1, B: 2, C: 3, D: 4, E: 4 });
    expect(lines(rankResults(tiedLast, "plaatsen")).slice(3)).toEqual(["4 D 1,5 gedeeld", "4 E 1,5 gedeeld"]);
  });

  it("werkt met een eigen puntentabel en rondt pas af bij meer dan vier teams op één plaats", () => {
    const table = [5, 3, 1];
    expect(rankResults(results({ A: 3, B: 1, C: 2 }), "aantal_hoog", { table }).map((row) => row.twelfths)).toEqual([
      p(5),
      p(3),
      p(1),
    ]);
    expect(rankResults(results({ A: 1, B: 1 }), "tijd", { table: [7.5, 2.5] }).map((row) => row.twelfths)).toEqual([
      p(5),
      p(5),
    ]);
    // Vijf teams gelijk: (10 + 7 + 5 + 3 + 1) / 5 = 5,2 punten = 62,4 twaalfden, afgerond op 62.
    const five = rankResults(results({ A: 0, B: 0, C: 0, D: 0, E: 0 }), "tijd", { table: [10, 7, 5, 3, 1] });
    expect(five.map((row) => row.twelfths)).toEqual([62, 62, 62, 62, 62]);
  });

  it("houdt bij gelijke uitslag de volgorde van de invoer aan en laat de invoer heel", () => {
    const input = results({ Petrol: 5, Oranje: 5, Avocado: 9 });
    const before = structuredClone(input);
    expect(rankResults(input, "aantal_hoog").map((row) => row.team)).toEqual(["Avocado", "Petrol", "Oranje"]);
    expect(input).toEqual(before);
    expect(DEFAULT_PLACE_TABLE).toEqual([10, 7, 5, 3]);
  });
});

describe("medailles", () => {
  it("geeft goud, zilver en brons voor plaats 1, 2 en 3", () => {
    expect([1, 2, 3, 4, 5, null].map(medalForPlace)).toEqual(["goud", "zilver", "brons", null, null, null]);
    expect(medalForPlace(0)).toBeNull();
    expect(medalForPlace(1.5)).toBeNull();
  });

  it("geeft op punten alleen medailles aan teams met punten", () => {
    const halfway: ScoreEvent = { id: "vrijdag", kind: "vrijdag", countsForMedals: true, points: { Oranje: p(8), Mosterd: p(5) } };
    expect(eventMedals(halfway, TEAMS)).toEqual({ Oranje: "goud", Mosterd: "zilver", Avocado: null, Petrol: null });
  });

  it("geeft geen medailles voor het intermezzo, maar telt de punten wel mee", () => {
    const intermezzo: ScoreEvent = {
      id: "intermezzo",
      kind: "intermezzo",
      countsForMedals: false,
      points: { Avocado: p(3), Petrol: p(1) },
    };
    expect(eventMedals(intermezzo, TEAMS)).toEqual({ Oranje: null, Mosterd: null, Avocado: null, Petrol: null });
    expect(medalTable(TEAMS, [...WEEKEND, intermezzo])).toEqual(medalTable(TEAMS, WEEKEND));
    const rows = standings(TEAMS, [...WEEKEND, intermezzo]);
    expect(rows.map((row) => [row.team, formatPoints(row.twelfths)])).toEqual([
      ["Oranje", "98"],
      ["Mosterd", "96,5"],
      ["Avocado", "87,5"],
      ["Petrol", "84"],
    ]);
  });

  it("deelt een plaats in de medaillespiegel bij precies dezelfde medailles", () => {
    const one: ScoreEvent = { id: "a", kind: "vrijdag", countsForMedals: true, points: { Oranje: 3, Mosterd: 2, Avocado: 1 } };
    const two: ScoreEvent = { id: "b", kind: "vrijdag", countsForMedals: true, points: { Oranje: 2, Mosterd: 3, Avocado: 1 } };
    expect(medalTable(TEAMS, [one, two])).toEqual([
      { team: "Oranje", gold: 1, silver: 1, bronze: 0, place: 1, shared: true },
      { team: "Mosterd", gold: 1, silver: 1, bronze: 0, place: 1, shared: true },
      { team: "Avocado", gold: 0, silver: 0, bronze: 2, place: 3, shared: false },
      { team: "Petrol", gold: 0, silver: 0, bronze: 0, place: 4, shared: false },
    ]);
  });
});

describe("klassement", () => {
  it("sorteert op totaal en houdt bij gelijke stand de gegeven teamvolgorde aan", () => {
    const rows = standings(["Petrol", "Oranje", "Mosterd"], [VRIJDAG]);
    expect(rows.map((row) => [row.place, row.team])).toEqual([
      [1, "Oranje"],
      [2, "Petrol"],
      [3, "Mosterd"],
    ]);
    const empty = standings(["Petrol", "Oranje"], []);
    expect(empty.map((row) => [row.place, row.team, row.shared, row.twelfths])).toEqual([
      [1, "Petrol", true, 0],
      [1, "Oranje", true, 0],
    ]);
  });

  it("negeert onbekende teams en kapotte punten", () => {
    const odd: ScoreEvent = {
      id: "los",
      kind: "los",
      countsForMedals: false,
      points: { Oranje: Number.NaN, Test: p(50), Mosterd: p(1) },
    };
    const rows = standings(["Oranje", "Mosterd"], [odd]);
    expect(rows.map((row) => [row.team, row.twelfths])).toEqual([
      ["Mosterd", 12],
      ["Oranje", 0],
    ]);
    expect(standings(["constructor"], [odd])[0].twelfths).toBe(0);
  });
});

describe("punten tonen", () => {
  it("schrijft twaalfden met een komma en hoogstens 1 decimaal", () => {
    expect(formatPoints(1176)).toBe("98");
    expect(formatPoints(1158)).toBe("96,5");
    expect(formatPoints(88)).toBe("7,3");
    expect(formatPoints(92)).toBe("7,7");
    expect(formatPoints(-24)).toBe("-2");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(-0)).toBe("0");
    expect(formatPoints(1)).toBe("0,1");
    expect(formatPoints(-1)).toBe("-0,1");
    expect(formatPoints(6)).toBe("0,5");
    expect(formatPoints(-102)).toBe("-8,5");
  });

  it("rondt de helft af van nul af", () => {
    // 75 twaalfden = 6,25; 3 twaalfden = 0,25; 9 twaalfden = 0,75.
    expect(formatPoints(75)).toBe("6,3");
    expect(formatPoints(-75)).toBe("-6,3");
    expect(formatPoints(3)).toBe("0,3");
    expect(formatPoints(-3)).toBe("-0,3");
    expect(formatPoints(9)).toBe("0,8");
  });

  it("zet ingevoerde punten om naar twaalfden", () => {
    expect(pointsToTwelfths(8)).toBe(96);
    expect(pointsToTwelfths(7.5)).toBe(90);
    expect(pointsToTwelfths(-2)).toBe(-24);
    expect(pointsToTwelfths(-0.01)).toBe(0);
    expect(Object.is(pointsToTwelfths(-0.01), 0)).toBe(true);
    expect(pointsToTwelfths(Number.NaN)).toBe(0);
  });
});
