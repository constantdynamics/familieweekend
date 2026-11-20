import { describe, expect, it } from "vitest";
import { autoSubjects, fairnessCheck, type FairnessQuestion } from "@/lib/shared/fairness";

const TEAMS = ["Oranje", "Mosterd", "Avocado", "Petrol"];
/** Participant id → team id. */
const TEAM_OF: Record<string, string> = {
  sanne: "Oranje",
  piet: "Oranje",
  kees: "Mosterd",
  fatima: "Mosterd",
  lotte: "Avocado",
  daan: "Avocado",
  mila: "Petrol",
  bram: "Petrol",
};

/** "Voorkennis per team: Oranje 2, Mosterd 2, Avocado 2, Petrol 2", like the admin screen. */
const summary = (counts: Record<string, number>) =>
  `Voorkennis per team: ${TEAMS.map((team) => `${team} ${counts[team]}`).join(", ")}`;

describe("eerlijkheidscheck", () => {
  it("telt per ronde en voor de hele quiz, zonder waarschuwing als het eerlijk verdeeld is", () => {
    const questions: FairnessQuestion[] = [
      { round: 3, subjects: ["sanne"] },
      { round: 3, subjects: ["kees"] },
      { round: 3, subjects: ["lotte"] },
      { round: 3, subjects: ["mila"] },
      { round: 3, subjects: [] },
      { round: 5, subjects: ["piet"] },
      { round: 5, subjects: ["fatima"] },
      { round: 5, subjects: ["daan"] },
      { round: 5, subjects: ["bram"] },
      { round: 1, subjects: [] },
    ];
    const report = fairnessCheck(questions, TEAM_OF, TEAMS);
    expect(report.rounds.map((round) => round.round)).toEqual([1, 3, 5]);
    expect(report.rounds[0]).toEqual({
      round: 1,
      counts: { Oranje: 0, Mosterd: 0, Avocado: 0, Petrol: 0 },
      min: 0,
      max: 0,
      warning: false,
    });
    expect(summary(report.rounds[1].counts)).toBe("Voorkennis per team: Oranje 1, Mosterd 1, Avocado 1, Petrol 1");
    expect(summary(report.total.counts)).toBe("Voorkennis per team: Oranje 2, Mosterd 2, Avocado 2, Petrol 2");
    expect(report.total).toMatchObject({ min: 2, max: 2, warning: false });
    expect(report.warnings).toEqual([]);
    expect(report.unknownSubjects).toEqual([]);
  });

  it("telt een vraag één keer per team met voorkennis", () => {
    const report = fairnessCheck(
      [
        // Twee onderwerpen uit hetzelfde team: één keer voor Oranje.
        { round: 1, subjects: ["sanne", "piet"] },
        // Onderwerpen uit twee teams: voor allebei.
        { round: 1, subjects: ["kees", "mila", "bram"] },
      ],
      TEAM_OF,
      TEAMS,
    );
    expect(report.total.counts).toEqual({ Oranje: 1, Mosterd: 1, Avocado: 0, Petrol: 1 });
    expect(report.warnings).toEqual([]);
  });

  it("waarschuwt bij een verschil van meer dan 1 in een ronde", () => {
    const report = fairnessCheck(
      [
        { round: 2, subjects: ["sanne"] },
        { round: 2, subjects: ["piet"] },
        { round: 2, subjects: ["kees"] },
        { round: 2, subjects: ["lotte"] },
        { round: 4, subjects: ["mila"] },
        { round: 4, subjects: ["bram"] },
        { round: 4, subjects: ["kees"] },
        { round: 4, subjects: ["daan"] },
      ],
      TEAM_OF,
      TEAMS,
    );
    expect(report.rounds.map((round) => [round.round, round.min, round.max, round.warning])).toEqual([
      [2, 0, 2, true],
      [4, 0, 2, true],
    ]);
    // Over de hele quiz is het wel eerlijk: 2, 2, 2, 2.
    expect(report.total.warning).toBe(false);
    expect(report.warnings).toEqual([
      { round: 2, most: ["Oranje"], least: ["Petrol"], difference: 2 },
      { round: 4, most: ["Petrol"], least: ["Oranje"], difference: 2 },
    ]);
  });

  it("waarschuwt niet bij een verschil van precies 1", () => {
    const report = fairnessCheck(
      [
        { round: 1, subjects: ["sanne"] },
        { round: 1, subjects: ["kees"] },
      ],
      TEAM_OF,
      TEAMS,
    );
    expect(report.rounds[0]).toMatchObject({ min: 0, max: 1, warning: false });
    expect(report.warnings).toEqual([]);
  });

  it("waarschuwt voor de hele quiz als kleine verschillen per ronde optellen", () => {
    const report = fairnessCheck(
      [
        { round: 1, subjects: ["sanne"] },
        { round: 2, subjects: ["piet"] },
        { round: 2, subjects: ["kees"] },
        { round: 2, subjects: ["lotte"] },
        { round: 2, subjects: ["mila"] },
      ],
      TEAM_OF,
      TEAMS,
    );
    expect(report.rounds.map((round) => round.warning)).toEqual([false, false]);
    expect(report.total).toMatchObject({ counts: { Oranje: 2, Mosterd: 1, Avocado: 1, Petrol: 1 }, warning: false });

    const worse = fairnessCheck(
      [
        { round: 1, subjects: ["sanne"] },
        { round: 2, subjects: ["piet"] },
        { round: 3, subjects: ["sanne"] },
      ],
      TEAM_OF,
      TEAMS,
    );
    expect(worse.rounds.map((round) => round.warning)).toEqual([false, false, false]);
    expect(worse.total).toMatchObject({ min: 0, max: 3, warning: true });
    expect(worse.warnings).toEqual([
      { round: null, most: ["Oranje"], least: ["Mosterd", "Avocado", "Petrol"], difference: 3 },
    ]);
  });

  it("meldt onderwerpen die geen deelnemer zijn en telt teams buiten de lijst niet mee", () => {
    const report = fairnessCheck(
      [
        { round: 1, subjects: ["sane", "kees"] },
        { round: 1, subjects: ["sane", "quizmaster"] },
      ],
      { ...TEAM_OF, quizmaster: "Organisatie" },
      TEAMS,
    );
    expect(report.unknownSubjects).toEqual(["sane"]);
    expect(report.total.counts).toEqual({ Oranje: 0, Mosterd: 1, Avocado: 0, Petrol: 0 });
    expect(fairnessCheck([], TEAM_OF, TEAMS)).toEqual({
      rounds: [],
      total: { counts: { Oranje: 0, Mosterd: 0, Avocado: 0, Petrol: 0 }, min: 0, max: 0, warning: false },
      warnings: [],
      unknownSubjects: [],
    });
    expect(fairnessCheck([{ round: 1, subjects: ["sanne"] }], TEAM_OF, []).total).toEqual({
      counts: {},
      min: 0,
      max: 0,
      warning: false,
    });
  });
});

describe("onderwerpen automatisch invullen", () => {
  const options = [{ participantId: "sanne" }, { participantId: "kees" }, { participantId: "lotte" }, { participantId: "mila" }];

  it("wie_van_ons: de deelnemer van het goede antwoord, plus wat er met de hand bij staat", () => {
    expect(autoSubjects({ type: "wie_van_ons", options, correct: 2 })).toEqual(["lotte"]);
    expect(autoSubjects({ type: "wie_van_ons", options, correct: 2, subjects: ["daan", "lotte"] })).toEqual([
      "lotte",
      "daan",
    ]);
  });

  it("wie_van_ons zonder geldig goed antwoord: alleen de gegeven onderwerpen", () => {
    expect(autoSubjects({ type: "wie_van_ons", options, correct: 7, subjects: ["daan"] })).toEqual(["daan"]);
    expect(autoSubjects({ type: "wie_van_ons", options: [{}, { participantId: null }], correct: 1 })).toEqual([]);
    expect(autoSubjects({ type: "wie_van_ons", correct: 0 })).toEqual([]);
  });

  it("echt_of_ai: de inzender van de foto", () => {
    expect(autoSubjects({ type: "echt_of_ai", submitterId: "bram" })).toEqual(["bram"]);
    expect(autoSubjects({ type: "echt_of_ai", submitterId: "bram", subjects: ["bram"] })).toEqual(["bram"]);
    expect(autoSubjects({ type: "echt_of_ai", submitterId: null })).toEqual([]);
  });

  it("andere types: de gegeven onderwerpen, zonder dubbele of lege", () => {
    expect(autoSubjects({ type: "meerkeuze", subjects: ["piet", "", "piet", "fatima"] })).toEqual(["piet", "fatima"]);
    expect(autoSubjects({ type: "kaart", options, correct: 0, submitterId: "bram" })).toEqual([]);
    expect(autoSubjects({ type: "schatting", subjects: null })).toEqual([]);
  });

  it("levert de invoer voor de eerlijkheidscheck", () => {
    const quiz = [
      { round: 3, type: "wie_van_ons" as const, options, correct: 0 },
      { round: 3, type: "wie_van_ons" as const, options, correct: 0 },
      { round: 5, type: "echt_of_ai" as const, submitterId: "piet" },
    ];
    const report = fairnessCheck(
      quiz.map((question) => ({ round: question.round, subjects: autoSubjects(question) })),
      TEAM_OF,
      TEAMS,
    );
    expect(report.rounds.map((round) => [round.round, round.counts.Oranje, round.warning])).toEqual([
      [3, 2, true],
      [5, 1, false],
    ]);
    expect(report.total.warning).toBe(true);
  });
});
