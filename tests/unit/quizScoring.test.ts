import { describe, expect, it } from "vitest";
import {
  quizTotals,
  roundPoints,
  scoreQuestion,
  type Answer,
  type Question,
  type QuizRound,
} from "@/lib/shared/quizScoring";
import { formatPoints } from "@/lib/shared/scoring";

/** Valkenburg aan de Geul, as in the example of SPEC §9.2. */
const GEUL = { lat: 50.865, lng: 5.832 };
/** De Dommelvallei, 55 km from the Geul. */
const DOMMELVALLEI = { lat: 51.2975, lng: 5.4417 };

/** Answers of the wrong shape, as a broken or tampered phone could send them. */
const odd = (value: unknown) => value as Answer;
/** A question of the wrong shape, as a broken database row could give it. */
const broken = (value: unknown) => value as Question;

describe("vragen met één goed antwoord", () => {
  it.each(["meerkeuze", "wie_van_ons", "schatting_bereik"] as const)("%s: 1 punt voor de goede tegel", (type) => {
    const scores = scoreQuestion(
      { type, correct: { choice: 2 } },
      { Oranje: { choice: 2 }, Mosterd: { choice: 1 }, Avocado: undefined, Petrol: { choice: 2 } },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 12, correct: true },
      Mosterd: { twelfths: 0, correct: false },
      Avocado: { twelfths: 0, correct: false },
      Petrol: { twelfths: 12, correct: true },
    });
  });

  it("waar_niet_waar: 1 punt voor het goede antwoord", () => {
    const scores = scoreQuestion(
      { type: "waar_niet_waar", correct: { bool: false } },
      { Oranje: { bool: false }, Mosterd: { bool: true }, Avocado: odd({ bool: "false" }), Petrol: odd({ choice: 0 }) },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 12, correct: true },
      Mosterd: { twelfths: 0, correct: false },
      Avocado: { twelfths: 0, correct: false },
      Petrol: { twelfths: 0, correct: false },
    });
  });

  it("echt_of_ai: 1 punt voor echt of AI", () => {
    const scores = scoreQuestion(
      { type: "echt_of_ai", correct: { realOrAi: "ai" } },
      { Oranje: { realOrAi: "ai" }, Mosterd: { realOrAi: "echt" }, Avocado: odd({ realOrAi: "AI" }), Petrol: odd("ai") },
    );
    expect(Object.values(scores).map((score) => score.twelfths)).toEqual([12, 0, 0, 0]);
  });

  it("geeft 0 voor een antwoord van de verkeerde vorm en gooit nooit een fout", () => {
    const question: Question = { type: "meerkeuze", correct: { choice: 0 } };
    const scores = scoreQuestion(question, {
      tekst: odd({ choice: "0" }),
      half: { choice: 0.5 },
      negatief: { choice: -1 },
      leeg: odd(null),
      lijst: odd([0]),
      ander: { bool: true },
      goed: { choice: 0 },
    });
    expect(Object.entries(scores).filter(([, score]) => score.correct).map(([team]) => team)).toEqual(["goed"]);
  });

  it("geeft niemand punten bij een kapotte vraag", () => {
    const answers = { Oranje: { choice: 1 }, Mosterd: { bool: true } };
    const none = { Oranje: { twelfths: 0, correct: false }, Mosterd: { twelfths: 0, correct: false } };
    expect(scoreQuestion(broken(null), answers)).toEqual(none);
    expect(scoreQuestion(broken({ type: "onbekend", correct: { choice: 1 } }), answers)).toEqual(none);
    expect(scoreQuestion(broken({ type: "meerkeuze" }), answers)).toEqual(none);
    expect(scoreQuestion(broken({ type: "meerkeuze", correct: { choice: "1" } }), answers)).toEqual(none);
    // A broken index never matches, not even a tampered answer with the same value.
    const tampered = { Oranje: { choice: -1 }, Mosterd: { choice: 1.5 } };
    expect(scoreQuestion({ type: "meerkeuze", correct: { choice: -1 } }, tampered)).toEqual(none);
    expect(scoreQuestion({ type: "wie_van_ons", correct: { choice: 1.5 } }, tampered)).toEqual(none);
    expect(scoreQuestion(broken({ type: "kaart", correct: { ...GEUL, scale: "heelal" } }), answers)).toEqual(none);
    expect(scoreQuestion(broken({ type: "kaart", correct: { lat: 91, lng: 5, scale: "wereld" } }), answers)).toEqual(none);
    expect(scoreQuestion({ type: "meerkeuze", correct: { choice: 1 } }, null as unknown as Record<string, Answer>)).toEqual({});
  });
});

describe("schatting", () => {
  it("geeft het punt aan het team dat er het dichtst bij zit", () => {
    const scores = scoreQuestion(
      { type: "schatting", correct: { number: 39 } },
      { Oranje: { number: 40 }, Mosterd: { number: 35 }, Avocado: { number: 50 }, Petrol: { number: 39 } },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 0, correct: false, difference: 1 },
      Mosterd: { twelfths: 0, correct: false, difference: 4 },
      Avocado: { twelfths: 0, correct: false, difference: 11 },
      Petrol: { twelfths: 12, correct: true, difference: 0 },
    });
  });

  it("geeft bij gelijke afstand alle betrokken teams het punt", () => {
    const scores = scoreQuestion(
      { type: "schatting", correct: { number: 39 } },
      { Oranje: { number: 37 }, Mosterd: { number: 41 }, Avocado: { number: 45 }, Petrol: undefined },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 12, correct: true, difference: 2 },
      Mosterd: { twelfths: 12, correct: true, difference: 2 },
      Avocado: { twelfths: 0, correct: false, difference: 6 },
      Petrol: { twelfths: 0, correct: false },
    });
  });

  it("laat afrondingsruis van kommagetallen een gelijke afstand niet breken", () => {
    // In floating point is 7.6 − 7.4 kleiner dan 7.4 − 7.2.
    expect(7.6 - 7.4).toBeLessThan(7.4 - 7.2);
    const scores = scoreQuestion(
      { type: "schatting", correct: { number: 7.4 } },
      { Oranje: { number: 7.2 }, Mosterd: { number: 7.6 }, Avocado: { number: 7.9 } },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 12, correct: true, difference: 0.2 },
      Mosterd: { twelfths: 12, correct: true, difference: 0.2 },
      Avocado: { twelfths: 0, correct: false, difference: 0.5 },
    });
    const large = scoreQuestion(
      { type: "schatting", correct: { number: 123456.7 } },
      { Oranje: { number: 123456.5 }, Mosterd: { number: 123456.9 } },
    );
    expect(Object.values(large)).toEqual([
      { twelfths: 12, correct: true, difference: 0.2 },
      { twelfths: 12, correct: true, difference: 0.2 },
    ]);
  });

  it("geeft een team zonder (geldig) antwoord nooit het punt", () => {
    const scores = scoreQuestion(
      { type: "schatting", correct: { number: 39 } },
      {
        Oranje: { number: 400 },
        Mosterd: odd({ number: "39" }),
        Avocado: { number: Number.NaN },
        Petrol: { choice: 39 },
      },
    );
    expect(scores).toEqual({
      Oranje: { twelfths: 12, correct: true, difference: 361 },
      Mosterd: { twelfths: 0, correct: false },
      Avocado: { twelfths: 0, correct: false },
      Petrol: { twelfths: 0, correct: false },
    });
    const nobody = scoreQuestion({ type: "schatting", correct: { number: 39 } }, { Oranje: undefined });
    expect(nobody).toEqual({ Oranje: { twelfths: 0, correct: false } });
    const noTarget = scoreQuestion(broken({ type: "schatting", correct: { number: null } }), { Oranje: { number: 3 } });
    expect(noTarget).toEqual({ Oranje: { twelfths: 0, correct: false } });
  });
});

describe("kaartvraag", () => {
  it("geeft 0 tot 3 punten naar afstand, schaal nederland", () => {
    const scores = scoreQuestion(
      { type: "kaart", correct: { ...GEUL, scale: "nederland" } },
      {
        Oranje: { lat: 50.87, lng: 5.84 },
        Mosterd: DOMMELVALLEI,
        Avocado: { lat: 52.18, lng: 4.43 },
        Petrol: undefined,
      },
    );
    expect(scores.Oranje).toMatchObject({ twelfths: 36, correct: true });
    expect(scores.Oranje.distanceKm).toBeCloseTo(0.79, 2);
    expect(scores.Mosterd).toMatchObject({ twelfths: 12, correct: true });
    expect(scores.Mosterd.distanceKm).toBeCloseTo(55.28, 2);
    expect(scores.Avocado).toMatchObject({ twelfths: 0, correct: false });
    expect(scores.Avocado.distanceKm).toBeCloseTo(175.46, 2);
    expect(scores.Petrol).toEqual({ twelfths: 0, correct: false });
  });

  it("rekent met de schaal wereld", () => {
    const falkenberg = { lat: 56.9055, lng: 12.4912, scale: "wereld" as const };
    const scores = scoreQuestion(
      { type: "kaart", correct: falkenberg },
      { Oranje: { lat: 56.5, lng: 12.9 }, Mosterd: GEUL, Avocado: { lat: 40.4, lng: -3.7 } },
    );
    expect(Object.values(scores).map((score) => score.twelfths)).toEqual([36, 12, 0]);
  });

  it("geeft geen punten voor een speld die niet kan bestaan, wel voor een kaart die rondgedraaid is", () => {
    const scores = scoreQuestion(
      { type: "kaart", correct: { ...GEUL, scale: "nederland" } },
      {
        noordpool: { lat: 95, lng: 5.8 },
        nan: { lat: Number.NaN, lng: 5.8 },
        tekst: odd({ lat: "50.865", lng: "5.832" }),
        rond: { lat: GEUL.lat, lng: GEUL.lng + 360 },
      },
    );
    expect(scores.noordpool).toEqual({ twelfths: 0, correct: false });
    expect(scores.nan).toEqual({ twelfths: 0, correct: false });
    expect(scores.tekst).toEqual({ twelfths: 0, correct: false });
    expect(scores.rond.twelfths).toBe(36);
    expect(scores.rond.distanceKm).toBeCloseTo(0, 6);
  });
});

describe("rondes en joker", () => {
  it("telt een ronde op", () => {
    const first = scoreQuestion({ type: "meerkeuze", correct: { choice: 1 } }, { Oranje: { choice: 1 }, Petrol: { choice: 0 } });
    const second = scoreQuestion({ type: "waar_niet_waar", correct: { bool: true } }, { Oranje: { bool: true }, Petrol: { bool: true } });
    expect(roundPoints([first, second])).toEqual({ Oranje: 24, Petrol: 12 });
    expect(roundPoints([])).toEqual({});
  });

  it("verdubbelt alle punten in de jokerronde: een kaartvraag van 3 punten wordt 6", () => {
    const kaart = scoreQuestion(
      { type: "kaart", correct: { ...GEUL, scale: "nederland" } },
      { Oranje: { lat: 50.87, lng: 5.84 }, Petrol: DOMMELVALLEI },
    );
    expect(kaart.Oranje.twelfths).toBe(36);
    const totals = quizTotals([{ round: 2, points: roundPoints([kaart]) }], { Oranje: 2 });
    expect(totals.Oranje).toEqual({
      twelfths: 72,
      jokerRound: 2,
      rounds: [{ round: 2, base: 36, twelfths: 72, joker: true }],
    });
    expect(formatPoints(totals.Oranje.twelfths)).toBe("6");
    // Petrol zit 55 km ernaast: 1 punt, zonder joker.
    expect(formatPoints(totals.Petrol.twelfths)).toBe("1");
  });

  it("verdubbelt alleen de jokerronde van het team zelf", () => {
    const rounds: QuizRound[] = [
      { round: 1, points: { Oranje: 60, Mosterd: 48 } },
      { round: 2, points: { Oranje: 36, Mosterd: 72 } },
      { round: 3, points: { Oranje: 84 } },
    ];
    const totals = quizTotals(rounds, { Oranje: 3, Mosterd: 2, Avocado: 1 });
    expect(totals.Oranje.twelfths).toBe(60 + 36 + 168);
    expect(totals.Mosterd.twelfths).toBe(48 + 144);
    expect(totals.Mosterd.rounds.map((round) => [round.round, round.base, round.twelfths, round.joker])).toEqual([
      [1, 48, 48, false],
      [2, 72, 144, true],
      [3, 0, 0, false],
    ]);
    // Avocado zette een joker maar haalde geen punten: staat er wel in.
    expect(totals.Avocado).toMatchObject({ twelfths: 0, jokerRound: 1 });
  });

  it("verdubbelt niets bij een joker zonder punten of op een ronde die niet bestaat", () => {
    const totals = quizTotals([{ round: 1, points: { Oranje: 12, Petrol: Number.NaN } }], { Oranje: 7, Petrol: undefined });
    expect(totals.Oranje).toEqual({ twelfths: 12, jokerRound: 7, rounds: [{ round: 1, base: 12, twelfths: 12, joker: false }] });
    expect(totals.Petrol).toEqual({ twelfths: 0, jokerRound: null, rounds: [{ round: 1, base: 0, twelfths: 0, joker: false }] });
    expect(quizTotals([], {})).toEqual({});
  });
});
