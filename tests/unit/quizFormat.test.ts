import { describe, expect, it } from "vitest";
import { DEMO_ROUNDS } from "@/lib/server/quiz/demo";
import { fairnessFor, subjectsOf } from "@/lib/server/quiz/fairness";
import { parseQuizFile, toQuizFile } from "@/lib/server/quiz/format";
import { heavyMapRounds, quizStandings, roundMaxPoints } from "@/lib/server/quiz/scores";
import { QUESTION_TYPES, type QuizContent } from "@/lib/server/quiz/types";
import { CONTENT, question } from "./quizFixture";

/** The example of SPEC §9.2. */
const VOORBEELD = {
  titel: "De Grote Valkenburger Quiz",
  rondes: [
    {
      nummer: 1,
      titel: "Familie in cijfers",
      luistermodus: false,
      intermezzo_na: false,
      vragen: [
        {
          id: "r1v1",
          type: "meerkeuze",
          vraag: "Hoeveel van ons hebben ooit iets gebroken?",
          opties: ["9", "14", "17", "23"],
          goed: 2,
          uitleg: "17 van de 45 familieleden brak ooit iets.",
          foto: null,
          onderwerp: [],
          notitie: "",
        },
        { id: "r1v2", type: "kaart", vraag: "Waar ligt Valkenburg aan de Geul?", antwoord: { lat: 50.865, lng: 5.832 }, schaal: "nederland" },
      ],
    },
  ],
};

function errors(file: unknown): string[] {
  const result = parseQuizFile(JSON.stringify(file));
  if (result.ok) throw new Error("had fouten moeten geven");
  return result.errors;
}

describe("het quizbestand (SPEC §9.2)", () => {
  it("leest het voorbeeld uit de SPEC", () => {
    const result = parseQuizFile(JSON.stringify(VOORBEELD));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quiz.title).toBe("De Grote Valkenburger Quiz");
    expect(result.quiz.rounds[0]).toMatchObject({ number: 1, title: "Familie in cijfers", listening: false, intermezzoAfter: false });
    expect(result.quiz.rounds[0].questions).toEqual([
      {
        extId: "r1v1",
        kind: "meerkeuze",
        text: "Hoeveel van ons hebben ooit iets gebroken?",
        options: ["9", "14", "17", "23"],
        correct: 2,
        unit: null,
        scale: null,
        explanation: "17 van de 45 familieleden brak ooit iets.",
        photo: null,
        photoCredit: null,
        subjects: [],
        note: null,
      },
      {
        extId: "r1v2",
        kind: "kaart",
        text: "Waar ligt Valkenburg aan de Geul?",
        options: null,
        correct: { lat: 50.865, lng: 5.832 },
        unit: null,
        scale: "nederland",
        explanation: null,
        photo: null,
        photoCredit: null,
        subjects: [],
        note: null,
      },
    ]);
  });

  it("zegt in het Nederlands wat er mis is, en waar", () => {
    const file = structuredClone(VOORBEELD) as { rondes: { vragen: Record<string, unknown>[] }[] };
    file.rondes[0].vragen[0].opties = ["ja"];
    file.rondes[0].vragen[1] = { id: "r1v2", type: "kaart", vraag: "Waar?", antwoord: { lat: 95, lng: 5 } };
    file.rondes[0].vragen.push({ id: "r1v3", type: "raadsel", vraag: "" });
    file.rondes[0].vragen.push({ id: "r1v4", type: "schatting", vraag: "Hoeveel?", goed: 4, onderwerpen: ["X"] });
    expect(errors(file)).toEqual([
      "Ronde 1, vraag 1 (r1v1), opties: Bij dit type horen 2 tot 4 opties, dit zijn er 1.",
      "Ronde 1, vraag 1 (r1v1), goed: goed is het nummer van de goede optie: 0 voor de eerste.",
      "Ronde 1, vraag 2 (r1v2), antwoord, lat: lat ligt tussen -90 en 90.",
      "Ronde 1, vraag 2 (r1v2), schaal: Kies een schaal: nederland of wereld.",
      "Ronde 1, vraag 3 (r1v3), type: Onbekend type. Kies uit: meerkeuze, waar_niet_waar, wie_van_ons, schatting, schatting_bereik, kaart, echt_of_ai.",
      "Ronde 1, vraag 3 (r1v3), vraag: De vraag is leeg.",
      "Ronde 1, vraag 4 (r1v4): Onbekend veld: onderwerpen. Haal het weg of kijk of het goed gespeld is.",
      "Ronde 1, vraag 4 (r1v4), antwoord: antwoord is het goede getal.",
      "Ronde 1, vraag 4 (r1v4), goed: Bij een schatting staat het goede getal in antwoord, niet in goed.",
    ]);
  });

  it("vindt dubbele rondes en id's, en kapotte JSON", () => {
    const dubbel = structuredClone(VOORBEELD);
    dubbel.rondes.push({ ...structuredClone(VOORBEELD.rondes[0]) });
    expect(errors(dubbel)).toEqual([
      "Ronde 1, nummer: Rondenummer 1 staat er twee keer in.",
      'Ronde 1, vraag 1 (r1v1), id: De id "r1v1" staat er twee keer in.',
      'Ronde 1, vraag 2 (r1v2), id: De id "r1v2" staat er twee keer in.',
    ]);
    const kapot = parseQuizFile('{\n  "titel": "Quiz",\n  "rondes": [\n    { "nummer": 1, }\n  ]\n}');
    expect(kapot).toEqual({ ok: false, errors: [expect.stringMatching(/^Dit is geen geldige JSON: er klopt iets niet op regel 4\./)] });
    expect(errors({ titel: "Leeg", rondes: [{ nummer: 1, titel: "Niks", vragen: [] }] })).toEqual(["Er staat geen enkele vraag in."]);
  });

  it("schrijft een opgeslagen quiz terug naar hetzelfde formaat (export als backup)", () => {
    const file = toQuizFile(CONTENT);
    const again = parseQuizFile(JSON.stringify(file));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.quiz.rounds.map((round) => round.questions.length)).toEqual([2, 0, 1]);
    expect(again.quiz.rounds[0].questions[0]).toMatchObject({ kind: "meerkeuze", correct: 2, note: "Geheime notitie", subjects: ["Daan Proef"] });
    expect(again.quiz.rounds[0].questions[1]).toMatchObject({ kind: "kaart", correct: { lat: 50.865, lng: 5.832 }, scale: "nederland" });
    expect(again.quiz.rounds[2]).toMatchObject({ listening: true, intermezzoAfter: true });
  });
});

describe("de demo-quiz (SPEC §9.5)", () => {
  it("heeft vijf rondes van twee of drie vragen, elk vraagtype en het intermezzo na ronde 3", () => {
    expect(DEMO_ROUNDS.map((round) => round.questions.length).every((count) => count >= 2 && count <= 3)).toBe(true);
    expect(DEMO_ROUNDS.map((round) => round.number)).toEqual([1, 2, 3, 4, 5]);
    const types = new Set(DEMO_ROUNDS.flatMap((round) => round.questions.map((q) => q.kind)));
    expect([...types].sort()).toEqual([...QUESTION_TYPES].sort());
    expect(DEMO_ROUNDS.find((round) => round.intermezzoAfter)?.number).toBe(3);
    expect(DEMO_ROUNDS.find((round) => round.listening)?.number).toBe(3);
    // Map questions in the style of GeoGuessr, all with a photo.
    const maps = DEMO_ROUNDS.flatMap((round) => round.questions).filter((q) => q.kind === "kaart");
    expect(maps.length).toBeGreaterThanOrEqual(2);
    for (const map of maps) expect(map.photo).toBeTruthy();
  });

  it("past in het quizformaat", () => {
    const file = {
      titel: "Proefquiz",
      rondes: DEMO_ROUNDS.map((round) => ({
        nummer: round.number,
        titel: round.title,
        luistermodus: round.listening,
        intermezzo_na: round.intermezzoAfter,
        vragen: round.questions.map((q) => ({
          id: q.extId,
          type: q.kind,
          vraag: q.text,
          ...(q.options ? { opties: q.options } : {}),
          ...(q.kind === "schatting" || q.kind === "kaart" ? { antwoord: q.correct } : { goed: q.correct }),
          ...(q.unit ? { eenheid: q.unit } : {}),
          ...(q.scale ? { schaal: q.scale } : {}),
        })),
      })),
    };
    expect(parseQuizFile(JSON.stringify(file))).toMatchObject({ ok: true });
  });
});

describe("punten, maxima en eerlijkheid", () => {
  it("telt de quiz op met de joker en correcties, met gedeelde plaatsen", () => {
    const standings = quizStandings(
      CONTENT,
      {
        q1: { a: { answer: { choice: 2 }, overrideTwelfths: null }, b: { answer: { choice: 2 }, overrideTwelfths: null }, c: { answer: {}, overrideTwelfths: 6 } },
        q2: { a: { answer: { lat: 50.87, lng: 5.84 }, overrideTwelfths: null } },
      },
      { b: 1 },
      ["a", "b", "c", "d"],
    );
    expect(standings.map((row) => [row.teamId, row.place, row.shared, row.twelfths, row.jokerRound])).toEqual([
      ["a", 1, false, 48, null],
      ["b", 2, false, 24, 1],
      ["c", 3, false, 6, null],
      ["d", 4, false, 0, null],
    ]);
  });

  it("waarschuwt als een kaartronde zwaarder telt dan de andere rondes", () => {
    expect(roundMaxPoints(CONTENT.rounds[0].questions)).toBe(4);
    expect(heavyMapRounds(CONTENT)).toEqual([{ round: 1, title: "Opwarmen", max: 4, othersMax: 1 }]);
    const fair: QuizContent = { ...CONTENT, rounds: [CONTENT.rounds[2]] };
    expect(heavyMapRounds(fair)).toEqual([]);
  });

  it("telt voorkennis per team, met het goede antwoord bij wie van ons en de inzender bij Echt of AI", () => {
    const wie = question({ kind: "wie_van_ons", text: "?", options: ["Anna", "Daan", "Gijs"], correct: 1 });
    const echt = question({ kind: "echt_of_ai", text: "?", correct: "ai", photoUploadId: "foto-1", subjects: ["Bram"] });
    expect(subjectsOf(wie, null)).toEqual(["Daan"]);
    expect(subjectsOf(echt, "Hanna")).toEqual(["Hanna", "Bram"]);
    const content: QuizContent = {
      ...CONTENT,
      rounds: [{ ...CONTENT.rounds[0], questions: [wie, echt, question({ kind: "meerkeuze", text: "?", options: ["a", "b"], correct: 0, subjects: ["Onbekend Iemand"] })] }],
    };
    const report = fairnessFor(
      content,
      [
        { name: "Daan", nickname: null, teamId: "mosterd" },
        { name: "Bram", nickname: null, teamId: "oranje" },
        { name: "Hanna Proef", nickname: "Hanna", teamId: "oranje" },
      ],
      [
        { id: "oranje", name: "Team Oranje" },
        { id: "mosterd", name: "Team Mosterd" },
        { id: "petrol", name: "Team Petrol" },
      ],
      { "foto-1": "Hanna" },
    );
    expect(report.line).toBe("Voorkennis per team: Oranje\u00A01, Mosterd\u00A01, Petrol\u00A00");
    expect(report.warnings).toEqual([]);
    expect(report.unknownSubjects).toEqual(["Onbekend Iemand"]);
  });
});
