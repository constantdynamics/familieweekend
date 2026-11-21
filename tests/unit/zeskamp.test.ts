import { describe, expect, it } from "vitest";
import { ceremonyPlan, hiddenPlaces, nextStepLabel } from "@/lib/shared/ceremony";
import { formatPoints } from "@/lib/shared/scoring";
import {
  checkResultValue,
  formatResultValue,
  formatSeconds,
  formatStopwatch,
  parseCardList,
  parseDecimal,
  parseStopwatch,
  pointsRule,
  pointsTableText,
  rankGame,
  roundResultValue,
  stopwatchSeconds,
} from "@/lib/shared/zeskamp";

describe("stopwatch", () => {
  it("toont minuten, seconden en honderdsten, afgekapt zoals een echte stopwatch", () => {
    expect(formatStopwatch(0)).toBe("00:00,00");
    expect(formatStopwatch(41_209.9)).toBe("00:41,20");
    expect(formatStopwatch(62_345)).toBe("01:02,34");
    expect(formatStopwatch(-5)).toBe("00:00,00");
    expect(stopwatchSeconds(41_209.9)).toBe(41.2);
    expect(formatSeconds(41.2)).toBe("00:41,20");
    expect(formatSeconds(43.05)).toBe("00:43,05");
  });

  it("leest een getypte tijd", () => {
    expect(parseStopwatch("1:02,34")).toBe(62.34);
    expect(parseStopwatch("00:41,20")).toBe(41.2);
    expect(parseStopwatch("62.3")).toBe(62.3);
    expect(parseStopwatch("1:75")).toBeNull();
    expect(parseStopwatch("snel")).toBeNull();
    expect(parseStopwatch("0")).toBeNull();
  });

  it("geeft gelijke tijden tot op de honderdste gelijke punten (§5.2)", () => {
    const tijden = [41_201, 41_209, 43_050, 52_100].map(stopwatchSeconds);
    const rows = rankGame(
      ["oranje", "mosterd", "avocado", "petrol"].map((team, index) => ({ team, value: tijden[index] })),
      "tijd",
      [10, 7, 5, 3],
      ["mosterd"],
    );
    expect(rows.map((r) => [r.team, r.place, formatPoints(r.twelfths), r.shared, r.joker])).toEqual([
      ["oranje", 1, "8,5", true, false],
      ["mosterd", 1, "17", true, true],
      ["avocado", 3, "5", false, false],
      ["petrol", 4, "3", false, false],
    ]);
  });
});

describe("uitslagen", () => {
  it("leest getallen met een komma", () => {
    expect(parseDecimal("7,5")).toBe(7.5);
    expect(parseDecimal(" 142 ")).toBe(142);
    expect(parseDecimal("-1,5")).toBe(-1.5);
    expect(parseDecimal("7,5 cm")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });

  it("controleert de waarde per uitslagtype", () => {
    expect(checkResultValue("tijd", 41.2, 4)).toBeNull();
    expect(checkResultValue("tijd", 0, 4)).not.toBeNull();
    expect(checkResultValue("aantal_hoog", 3.5, 4)).not.toBeNull();
    expect(checkResultValue("aantal_laag", 0, 4)).toBeNull();
    expect(checkResultValue("plaatsen", 5, 4)).not.toBeNull();
    expect(checkResultValue("plaatsen", 2, 4)).toBeNull();
    expect(checkResultValue("jury", 11, 4)).not.toBeNull();
    expect(checkResultValue("meting_hoog", Number.NaN, 4)).not.toBeNull();
    expect(roundResultValue("tijd", 41.204)).toBe(41.2);
    expect(roundResultValue("jury", 7.46)).toBe(7.5);
  });

  it("schrijft een uitslag zoals de spelleider hem ziet", () => {
    expect(formatResultValue("tijd", 41.2)).toBe("00:41,20");
    expect(formatResultValue("meting_hoog", 142, "cm")).toBe("142 cm");
    expect(formatResultValue("plaatsen", 2)).toBe("2e");
    expect(formatResultValue("jury", 7.5)).toBe("7,5");
  });

  it("legt de puntentabel uit", () => {
    expect(pointsTableText([10, 7, 5, 3])).toBe("10, 7, 5 en 3");
    expect(pointsRule([10, 7, 5, 3], "tijd")).toBe(
      "Plaats 1 tot 4 geeft 10, 7, 5 en 3 punten, de joker telt dubbel. Gelijke tijd? Dan delen de teams de punten van hun plaatsen.",
    );
  });
});

describe("spelhulp", () => {
  it("maakt kaartjes van een geplakte lijst", () => {
    expect(parseCardList("1. Een kameel\n- Fietsband plakken\n\nEen kameel\n  De   Eiffeltoren ")).toEqual([
      "Een kameel",
      "Fietsband plakken",
      "De Eiffeltoren",
    ]);
    expect(parseCardList("x".repeat(120))[0]).toHaveLength(80);
  });
});

describe("prijsuitreiking: de stappen", () => {
  it("gaat van plaats 4 naar de winnaar, met tromgeroffel ervoor", () => {
    const plan = ceremonyPlan([
      { team: "a", place: 1 },
      { team: "b", place: 2 },
      { team: "c", place: 3 },
      { team: "d", place: 4 },
    ]);
    expect(plan.map((s) => s.kind)).toEqual(["intro", "plaats", "plaats", "plaats", "trom", "winnaar", "einde"]);
    expect(plan.map((_, index) => nextStepLabel(plan, index))).toEqual([
      "Onthul plaats 4",
      "Onthul plaats 3",
      "Onthul plaats 2",
      "Tromgeroffel!",
      "Onthul de winnaar",
      "Naar de eindstand",
      "Sluit de prijsuitreiking af",
    ]);
    expect(hiddenPlaces(plan, 0)).toBe(4);
    expect(hiddenPlaces(plan, 3)).toBe(1);
    expect(hiddenPlaces(plan, 5)).toBe(0);
  });

  it("onthult gedeelde plaatsen in één keer", () => {
    const plan = ceremonyPlan([
      { team: "a", place: 1 },
      { team: "b", place: 1 },
      { team: "c", place: 3 },
      { team: "d", place: 3 },
    ]);
    expect(plan).toEqual([
      { kind: "intro" },
      { kind: "plaats", place: 3, teams: ["c", "d"] },
      { kind: "trom" },
      { kind: "winnaar", teams: ["a", "b"] },
      { kind: "einde" },
    ]);
    expect(nextStepLabel(plan, 2)).toBe("Onthul de winnaars");
  });
});
