/**
 * Practising the quiz: the steps of a run, and the captain's view of the
 * practice team, made by the same buildQuizView as on the evening.
 */
import { describe, expect, it } from "vitest";
import { bestaandeStap, OEFENTEAM, oefenStappen, oefenView, type OefenFase, type OefenStap } from "@/lib/server/quiz/oefenplan";
import { oefenMaximum } from "@/lib/shared/oefenen";
import { CONTENT, Q1, Q3 } from "./quizFixture";

function view(stap: OefenStap, fase: OefenFase, antwoord: unknown = null) {
  return oefenView({ env: "live", now: 5_000_000, content: CONTENT, stap, fase, antwoord, photoUrl: "/api/foto/x", extraPhotoUrls: [], submitter: null });
}

describe("de stappen van het oefenen", () => {
  it("speelt één vraag zonder rondescherm", () => {
    expect(oefenStappen(CONTENT, { soort: "vraag", vraag: "q2" })).toEqual([{ ronde: 1, vraag: "q2" }]);
    expect(oefenStappen(CONTENT, { soort: "vraag", vraag: "bestaat-niet" })).toEqual([]);
  });

  it("speelt een ronde met eerst het rondescherm", () => {
    expect(oefenStappen(CONTENT, { soort: "ronde", ronde: 1 })).toEqual([
      { ronde: 1, vraag: null },
      { ronde: 1, vraag: "q1" },
      { ronde: 1, vraag: "q2" },
    ]);
    expect(oefenStappen(CONTENT, { soort: "ronde", ronde: 2 })).toEqual([]);
  });

  it("speelt de hele quiz zonder lege rondes en zonder intermezzo", () => {
    expect(oefenStappen(CONTENT, { soort: "quiz" })).toEqual([
      { ronde: 1, vraag: null },
      { ronde: 1, vraag: "q1" },
      { ronde: 1, vraag: "q2" },
      { ronde: 3, vraag: null },
      { ronde: 3, vraag: "q3" },
    ]);
  });

  it("kent alleen stappen die in de quiz staan", () => {
    expect(bestaandeStap(CONTENT, { ronde: 1, vraag: "q3" })).toBe(false);
    expect(bestaandeStap(CONTENT, { ronde: 2, vraag: null })).toBe(false);
    expect(bestaandeStap(CONTENT, { ronde: 3, vraag: "q3" })).toBe(true);
    expect(view({ ronde: 1, vraag: "q3" }, "open")).toBeNull();
  });
});

describe("wat de oefencaptain ziet", () => {
  it("is captain van het Oefenteam, zonder joker", () => {
    const rondescherm = view({ ronde: 1, vraag: null }, "rondescherm");
    expect(rondescherm).toMatchObject({
      status: "quiz",
      phase: "rondescherm",
      question: null,
      round: { index: 1, total: 2, title: "Opwarmen" },
      me: { role: "captain", team: { id: OEFENTEAM.id, name: "Oefenteam" }, canJoker: false },
    });
  });

  it("krijgt de vraag zonder goed antwoord, en het eigen antwoord terug", () => {
    const open = view({ ronde: 1, vraag: "q1" }, "open");
    expect(open?.question).toMatchObject({ text: Q1.text, photoUrl: null, correct: null, explanation: null });
    expect(open?.me).toMatchObject({ canAnswer: true, answer: null });
    expect(open?.answeredCount).toBe(0);
    const gekozen = view({ ronde: 1, vraag: "q1" }, "open", { choice: 2 });
    expect(gekozen?.me.answer).toEqual({ choice: 2 });
    expect(gekozen?.answeredCount).toBe(1);
  });

  it("geeft nooit de notitie voor de quizmaster mee, ook niet in een luisterronde", () => {
    const open = view({ ronde: 3, vraag: "q3" }, "open");
    const onthuld = view({ ronde: 3, vraag: "q3" }, "onthuld", { choice: 1 });
    expect(JSON.stringify([open, onthuld])).not.toContain("Speel Dancing Queen");
    expect(open?.luisterGoed).toBe(false);
    expect(open?.question?.text).toBe(Q3.text);
    expect(onthuld?.teams[0].result).toMatchObject({ twelfths: 12, correct: true });
  });

  it("rekent bij het onthullen zoals op de avond: afstand en punten van een kaartvraag", () => {
    // About 3 km from Valkenburg aan de Geul: 3 points on the scale nederland.
    const dichtbij = view({ ronde: 1, vraag: "q2" }, "onthuld", { lat: 50.89, lng: 5.84 });
    expect(dichtbij?.question).toMatchObject({ correct: { lat: 50.865, lng: 5.832 }, photoUrl: "/api/foto/x" });
    expect(dichtbij?.teams[0].result).toMatchObject({ twelfths: 36, correct: true });
    expect(dichtbij?.teams[0].result?.distanceKm).toBeGreaterThan(2);
    // Utrecht is too far away for a point.
    expect(view({ ronde: 1, vraag: "q2" }, "onthuld", { lat: 52.09, lng: 5.12 })?.teams[0].result).toMatchObject({ twelfths: 0, correct: false });
  });

  it("negeert een antwoord dat niet bij de vraag past", () => {
    const fout = view({ ronde: 1, vraag: "q1" }, "onthuld", { lat: 1, lng: 2 });
    expect(fout?.me.answer).toBeNull();
    expect(fout?.teams[0].result).toMatchObject({ twelfths: 0, answer: null });
  });
});

describe("de oefenscore", () => {
  it("telt 3 punten voor een kaartvraag, 1 voor de rest, en schattingen niet", () => {
    expect(oefenMaximum("kaart")).toBe(36);
    expect(oefenMaximum("meerkeuze")).toBe(12);
    expect(oefenMaximum("echt_of_ai")).toBe(12);
    expect(oefenMaximum("schatting")).toBeNull();
  });
});
