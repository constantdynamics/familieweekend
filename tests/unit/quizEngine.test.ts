import { describe, expect, it } from "vitest";
import {
  answerAllowed,
  checkExpectation,
  consoleButtons,
  COUNTDOWN_MS,
  effectivePhase,
  jokerAllowed,
  normalize,
  positionLabel,
  transition,
  type Command,
} from "@/lib/server/quiz/engine";
import type { EngineState } from "@/lib/server/quiz/types";
import { CONTENT, REST } from "./quizFixture";

const NOW = 1_000_000;

/** Run steps one after the other; every step must succeed. */
function run(start: EngineState, ...commands: Command[]): EngineState {
  let state = start;
  for (const command of commands) {
    const result = transition(normalize(state, NOW), CONTENT, command, NOW);
    if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
    state = result.state;
  }
  return state;
}

function fails(state: EngineState, command: Command): string {
  const result = transition(normalize(state, NOW), CONTENT, command, NOW);
  if (result.ok) throw new Error(`${command.type} had moeten mislukken`);
  return result.error;
}

const START: Command = { type: "start", quizId: "quiz" };

describe("de quiz als toestandsmachine", () => {
  it("begint op het rondescherm van de eerste ronde, met de luistermodus van die ronde", () => {
    const state = run(REST, START);
    expect(state).toMatchObject({ mode: "quiz", roundNo: 1, questionId: null, phase: "rondescherm", listening: false });
  });

  it("volgt de knoppen in vaste volgorde: toon, sluit, onthul, volgende", () => {
    let state = run(REST, START, { type: "toon" });
    expect(state).toMatchObject({ phase: "open", questionId: "q1" });
    expect(fails(state, { type: "onthul" })).toBe("Sluit eerst de vraag.");
    expect(fails(state, { type: "volgende" })).toBe("Onthul eerst het antwoord.");
    state = run(state, { type: "sluit" });
    expect(state.phase).toBe("gesloten");
    state = run(state, { type: "onthul" });
    expect(state.phase).toBe("onthuld");
    state = run(state, { type: "volgende" });
    expect(state).toMatchObject({ phase: "open", questionId: "q2", roundNo: 1 });
  });

  it("geeft de vraag die opengaat door, voor de start van de Spelen", () => {
    const opened = transition(run(REST, START), CONTENT, { type: "toon" }, NOW);
    expect(opened).toMatchObject({ ok: true, opened: "q1" });
    const closed = transition(run(REST, START, { type: "toon" }), CONTENT, { type: "sluit" }, NOW);
    expect(closed).toMatchObject({ ok: true, opened: null });
  });

  it("sluit een ronde af met de tussenstand, slaat een lege ronde over en eindigt", () => {
    let state = run(REST, START, { type: "toon" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    state = run(state, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    expect(state).toMatchObject({ phase: "tussenstand", roundNo: 1, questionId: null });
    state = run(state, { type: "volgendeRonde" });
    // Round 2 has no questions: straight to round 3, a listening round.
    expect(state).toMatchObject({ phase: "rondescherm", roundNo: 3, listening: true });
    state = run(state, { type: "toon" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    expect(state).toMatchObject({ phase: "tussenstand", roundNo: 3 });
    state = run(state, { type: "volgendeRonde" });
    expect(state).toMatchObject({ phase: "einde", mode: "quiz" });
    state = run(state, { type: "afsluiten" });
    expect(state).toMatchObject({ phase: "einde", mode: "rust" });
  });

  it("gaat terug naar de vorige vraag, maar nooit terug naar een rondescherm dat al begonnen is", () => {
    const second = run(REST, START, { type: "toon" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    const back = run(second, { type: "vorige" });
    expect(back).toMatchObject({ phase: "onthuld", questionId: "q1" });
    expect(fails(back, { type: "vorige" })).toMatch(/de jokers liggen vast/);
    expect(fails(run(REST, START), { type: "vorige" })).toBe("Dit is de eerste ronde.");

    const standing = run(second, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    expect(run(standing, { type: "vorige" })).toMatchObject({ phase: "onthuld", questionId: "q2" });
    const round3 = run(standing, { type: "volgendeRonde" });
    expect(run(round3, { type: "vorige" })).toMatchObject({ phase: "tussenstand", roundNo: 1 });
  });

  it("laat de joker alleen toe op het rondescherm, voor de eerste vraag", () => {
    const screen = run(REST, START);
    expect(jokerAllowed(screen, 1)).toBe(true);
    expect(jokerAllowed(screen, 3)).toBe(false);
    expect(jokerAllowed(run(screen, { type: "toon" }), 1)).toBe(false);
    expect(jokerAllowed({ ...screen, mode: "rust" }, 1)).toBe(false);
  });

  it("telt tien seconden af en sluit de vraag daarna vanzelf", () => {
    const open = run(REST, START, { type: "toon" });
    const counting = run(open, { type: "nog10" });
    expect(counting.countdownUntil).toBe(NOW + COUNTDOWN_MS);
    expect(fails(counting, { type: "nog10" })).toBe("De tien seconden lopen al.");
    expect(answerAllowed(counting, "q1", NOW + COUNTDOWN_MS - 1)).toBe(true);
    expect(answerAllowed(counting, "q1", NOW + COUNTDOWN_MS)).toBe(false);
    expect(effectivePhase(counting, NOW + COUNTDOWN_MS)).toBe("gesloten");
    const later = normalize(counting, NOW + COUNTDOWN_MS + 5);
    expect(later).toMatchObject({ phase: "gesloten", countdownUntil: null });
    // Closing again after the countdown is harmless.
    const closed = transition(later, CONTENT, { type: "sluit" }, NOW + COUNTDOWN_MS + 5);
    expect(closed).toMatchObject({ ok: true, state: { phase: "gesloten" } });
  });

  it("neemt alleen antwoorden aan op de open vraag", () => {
    const open = run(REST, START, { type: "toon" });
    expect(answerAllowed(open, "q1", NOW)).toBe(true);
    expect(answerAllowed(open, "q2", NOW)).toBe(false);
    expect(answerAllowed(run(open, { type: "sluit" }), "q1", NOW)).toBe(false);
    expect(answerAllowed({ ...open, mode: "intermezzo" }, "q1", NOW)).toBe(false);
  });

  it("schakelt de luistermodus en pauzeert en hervat op dezelfde plek", () => {
    const open = run(REST, START, { type: "toon" });
    expect(run(open, { type: "luister", on: true }).listening).toBe(true);
    const paused = run(open, { type: "pauze" });
    expect(paused).toMatchObject({ mode: "rust", phase: "open", questionId: "q1" });
    expect(run(paused, { type: "hervat" })).toMatchObject({ mode: "quiz", phase: "open", questionId: "q1" });
    expect(fails(run(REST, START), { type: "hervat" })).toBe("De quiz loopt al.");
    expect(fails(REST, { type: "hervat" })).toMatch(/Start de quiz/);
  });

  it("start het intermezzo bij de tussenstand en gaat daarna naar de volgende ronde", () => {
    const standing = run(REST, START, { type: "toon" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    expect(fails(run(REST, START), { type: "intermezzo" })).toMatch(/tussen twee rondes/);
    const intermezzo = run(standing, { type: "intermezzo" });
    expect(intermezzo).toMatchObject({ mode: "intermezzo", phase: "tussenstand" });
    expect(fails(intermezzo, { type: "toon" })).toBe("Eerst terug naar de quiz.");
    expect(run(intermezzo, { type: "terugNaarQuiz" })).toMatchObject({ mode: "quiz", phase: "rondescherm", roundNo: 3 });
  });

  it("weigert te starten zonder vragen of als er al iets loopt", () => {
    expect(fails(run(REST, START), START)).toMatch(/Er loopt al iets/);
    const empty = { ...CONTENT, rounds: [CONTENT.rounds[1]] };
    expect(transition(REST, empty, START, NOW)).toEqual({ ok: false, error: "Deze quiz heeft nog geen vragen." });
    expect(transition(REST, CONTENT, { type: "start", quizId: "ander" }, NOW)).toMatchObject({ ok: false });
  });

  it("ziet een dubbele tik aan het verschil tussen wat de console zag en de echte stand", () => {
    const open = run(REST, START, { type: "toon" });
    const seen = { phase: "open" as const, questionId: "q1", roundNo: 1 };
    expect(checkExpectation(open, seen, { type: "sluit" })).toBeNull();
    const closed = run(open, { type: "sluit" });
    expect(checkExpectation(closed, seen, { type: "onthul" })).toMatch(/intussen verder/);
    // Closing twice is fine.
    expect(checkExpectation(closed, seen, { type: "sluit" })).toBeNull();
    expect(checkExpectation(closed, null, { type: "onthul" })).toBeNull();
  });

  it("geeft de console de juiste knoppen en de plek in de quiz", () => {
    const screen = run(REST, START);
    expect(consoleButtons(screen, CONTENT).main).toEqual({ command: "toon", label: "Toon vraag 1" });
    const open = run(screen, { type: "toon" });
    expect(consoleButtons(open, CONTENT)).toMatchObject({ main: { label: "Sluit de vraag" }, canCountdown: true, canGoBack: false });
    expect(consoleButtons(run(open, { type: "sluit" }), CONTENT).main?.label).toBe("Onthul het antwoord");
    const revealed = run(open, { type: "sluit" }, { type: "onthul" });
    expect(consoleButtons(revealed, CONTENT).main?.label).toBe("Volgende vraag");
    const last = run(revealed, { type: "volgende" }, { type: "sluit" }, { type: "onthul" });
    expect(consoleButtons(last, CONTENT).main?.label).toBe("Naar de tussenstand");
    expect(consoleButtons(last, CONTENT).canGoBack).toBe(true);
    expect(positionLabel(last, CONTENT)).toBe("Ronde 1 van 2, vraag 2 van 2");
    expect(positionLabel(screen, CONTENT)).toBe("Ronde 1 van 2");
    expect(consoleButtons(REST, CONTENT).main).toBeNull();
  });
});
