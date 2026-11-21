import { describe, expect, it } from "vitest";
import { botAnswer, foldLongitude, parseAnswer, parsePointsInput, readCorrect, scoreTeams } from "@/lib/server/quiz/answers";
import { correctLabel, formatDistance, valueLabel } from "@/lib/server/quiz/labels";
import { question, Q1, Q2 } from "./quizFixture";

describe("antwoorden van de captain", () => {
  it("neemt per type alleen de goede vorm aan", () => {
    expect(parseAnswer(Q1, { choice: 2 })).toEqual({ choice: 2 });
    expect(parseAnswer(Q1, { choice: 4 })).toBeNull();
    expect(parseAnswer(Q1, { choice: -1 })).toBeNull();
    expect(parseAnswer(Q1, { choice: 1.5 })).toBeNull();
    expect(parseAnswer(Q1, { choice: "2" })).toBeNull();
    expect(parseAnswer(Q1, { choice: 2, extra: true })).toBeNull();
    expect(parseAnswer(Q1, [2])).toBeNull();
    expect(parseAnswer(Q1, null)).toBeNull();

    const waar = question({ kind: "waar_niet_waar", text: "?", correct: true });
    expect(parseAnswer(waar, { bool: false })).toEqual({ bool: false });
    expect(parseAnswer(waar, { bool: "false" })).toBeNull();

    const echt = question({ kind: "echt_of_ai", text: "?", correct: "ai" });
    expect(parseAnswer(echt, { realOrAi: "ai" })).toEqual({ realOrAi: "ai" });
    expect(parseAnswer(echt, { realOrAi: "AI" })).toBeNull();

    const schatting = question({ kind: "schatting", text: "?", correct: 39 });
    expect(parseAnswer(schatting, { number: 39.123456 })).toEqual({ number: 39.1235 });
    expect(parseAnswer(schatting, { number: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseAnswer(schatting, { number: 2e12 })).toBeNull();
    expect(parseAnswer(schatting, { number: -0 })).toEqual({ number: 0 });
  });

  it("vouwt een speld die rond de wereld schoof terug, en weigert een onmogelijke plek", () => {
    expect(parseAnswer(Q2, { lat: 50.865, lng: 5.832 + 360 })).toEqual({ lat: 50.865, lng: 5.832 });
    expect(parseAnswer(Q2, { lat: 91, lng: 5 })).toBeNull();
    expect(parseAnswer(Q2, { lat: 50, lng: "5" })).toBeNull();
    expect(parseAnswer(Q2, { lat: 50, lng: 5, extra: 1 })).toBeNull();
    expect(foldLongitude(-190)).toBe(170);
    expect(foldLongitude(180)).toBe(-180);
  });

  it("leest het goede antwoord en weigert een kapotte waarde", () => {
    expect(readCorrect(Q1)).toBe(2);
    expect(readCorrect({ ...Q1, correct: 4 })).toBeNull();
    expect(readCorrect(Q2)).toEqual({ lat: 50.865, lng: 5.832 });
    expect(readCorrect({ ...Q2, correct: { lat: 99, lng: 1 } })).toBeNull();
    expect(readCorrect(question({ kind: "echt_of_ai", text: "?", correct: "nep" }))).toBeNull();
  });
});

describe("punten per team", () => {
  it("laat een correctie van de quizmaster winnen van de berekende punten", () => {
    const scores = scoreTeams(
      Q1,
      {
        oranje: { answer: { choice: 2 }, overrideTwelfths: null },
        mosterd: { answer: { choice: 1 }, overrideTwelfths: 12 },
        avocado: { answer: { choice: 2 }, overrideTwelfths: 0 },
        petrol: { answer: {}, overrideTwelfths: 6 },
      },
      ["oranje", "mosterd", "avocado", "petrol"],
    );
    expect(scores.oranje).toMatchObject({ twelfths: 12, computed: 12, override: null, correct: true });
    expect(scores.mosterd).toMatchObject({ twelfths: 12, computed: 0, override: 12, correct: true });
    expect(scores.avocado).toMatchObject({ twelfths: 0, computed: 12, override: 0, correct: false });
    // A correction without an answer: no answer, but the points count.
    expect(scores.petrol).toMatchObject({ twelfths: 6, answer: null });
  });

  it("geeft de kaartvraag 0 tot 3 punten naar afstand", () => {
    const scores = scoreTeams(
      Q2,
      { a: { answer: { lat: 50.87, lng: 5.84 }, overrideTwelfths: null }, b: { answer: { lat: 51.2975, lng: 5.4417 }, overrideTwelfths: null } },
      ["a", "b", "c"],
    );
    expect(scores.a.twelfths).toBe(36);
    expect(scores.b.twelfths).toBe(12);
    expect(scores.c).toMatchObject({ twelfths: 0, answer: null });
  });

  it("leest getypte punten in twaalfden", () => {
    expect(parsePointsInput("1")).toBe(12);
    expect(parsePointsInput("0,5")).toBe(6);
    expect(parsePointsInput(" 2.25 ")).toBe(27);
    expect(parsePointsInput("-1")).toBe(-12);
    expect(parsePointsInput("0")).toBe(0);
    expect(parsePointsInput("veel")).toBeNull();
    expect(parsePointsInput("")).toBeNull();
    expect(parsePointsInput("1000")).toBeNull();
  });
});

describe("nepteams", () => {
  it("geven een antwoord dat bij de vraag past", () => {
    let seed = 0.1;
    const random = () => {
      seed = (seed * 9301 + 0.49297) % 1;
      return seed;
    };
    for (let i = 0; i < 50; i += 1) {
      expect(parseAnswer(Q1, botAnswer(Q1, random))).not.toBeNull();
      const pin = botAnswer(Q2, random) as { lat: number; lng: number };
      expect(parseAnswer(Q2, pin)).not.toBeNull();
      expect(Math.abs(pin.lat - 50.865)).toBeLessThan(0.4);
      const schatting = question({ kind: "schatting", text: "?", correct: 39 });
      const getal = (botAnswer(schatting, random) as { number: number }).number;
      expect(getal).toBeGreaterThanOrEqual(23);
      expect(getal).toBeLessThanOrEqual(55);
    }
  });
});

describe("teksten voor de quizmaster", () => {
  it("noemt het goede antwoord en de antwoorden leesbaar", () => {
    expect(correctLabel(Q1)).toBe("C: Donderdag");
    expect(correctLabel(Q2)).toBe("50,865° N, 5,832° O (nederland)");
    expect(correctLabel(question({ kind: "schatting", text: "?", correct: 39, unit: "dagen" }))).toBe("39 dagen");
    expect(correctLabel(question({ kind: "waar_niet_waar", text: "?", correct: false }))).toBe("Niet waar");
    expect(valueLabel(Q1, { choice: 0 })).toBe("A: Maandag");
    expect(valueLabel(Q1, null)).toBe("geen antwoord");
    expect(formatDistance(0.069)).toBe("69 m");
    expect(formatDistance(4.26)).toBe("4,3 km");
    expect(formatDistance(430.4)).toBe("430 km");
  });
});
