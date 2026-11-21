/**
 * The secrecy of the quiz (SPEC §7.3) in the views: what a phone may see
 * per phase and role. The e2e test checks the same on the real API.
 */
import { describe, expect, it } from "vitest";
import { normalize, transition, type Command } from "@/lib/server/quiz/engine";
import type { StoredAnswer } from "@/lib/server/quiz/answers";
import { quizStandings } from "@/lib/server/quiz/scores";
import type { EngineState } from "@/lib/server/quiz/types";
import { buildConsoleView, buildQuizView, viewerSeesQuestion, type PhoneViewInput, type TeamRow, type Viewer } from "@/lib/server/quiz/view";
import { CONTENT, Q1, Q3, REST } from "./quizFixture";

const NOW = 5_000_000;
const TEAMS: TeamRow[] = [
  { id: "oranje", name: "Team Oranje", color: "oranje", hasDevice: true, captainName: "Sanne" },
  { id: "petrol", name: "Team Petrol", color: "petrol", hasDevice: true, captainName: "Kees" },
];
const CAPTAIN: Viewer = { role: "captain", teamId: "oranje", captainTakenOver: false, suggestCaptainLogin: false };
const MEEKIJKER: Viewer = { role: "meekijker", teamId: "oranje", captainTakenOver: false, suggestCaptainLogin: false };
const BEZOEKER: Viewer = { role: "bezoeker", teamId: null, captainTakenOver: false, suggestCaptainLogin: false };

function state(...commands: Command[]): EngineState {
  let current = REST;
  for (const command of [{ type: "start", quizId: "quiz" } as Command, ...commands]) {
    const result = transition(normalize(current, NOW), CONTENT, command, NOW);
    if (!result.ok) throw new Error(result.error);
    current = result.state;
  }
  return current;
}

const ANSWERS: Record<string, StoredAnswer> = {
  oranje: { answer: { choice: 2 }, overrideTwelfths: null },
  petrol: { answer: { choice: 0 }, overrideTwelfths: null },
};

function view(engine: EngineState, viewer: Viewer, extra: Partial<PhoneViewInput> = {}) {
  return buildQuizView({
    env: "test",
    version: 7,
    now: NOW,
    state: engine,
    lockClosed: false,
    content: CONTENT,
    teams: TEAMS,
    answers: ANSWERS,
    jokers: { petrol: 1 },
    standings: null,
    viewer,
    photoUrl: null,
    submitter: null,
    ...extra,
  });
}

const SECRETS = ["Hemelvaartsdag", "Donderdag", "Altijd op donderdag", "Geheime notitie", "Daan Proef"];

describe("geheimhouding per fase", () => {
  it("stuurt op het rondescherm geen vraag, geen opties en geen antwoord", () => {
    for (const viewer of [CAPTAIN, MEEKIJKER, BEZOEKER]) {
      const json = JSON.stringify(view(state(), viewer));
      for (const secret of SECRETS) expect(json).not.toContain(secret);
      expect(json).not.toContain('"choice"');
    }
    expect(view(state(), CAPTAIN)).toMatchObject({ phase: "rondescherm", question: null, round: { title: "Opwarmen" } });
  });

  it("geeft de vraag vanaf open, maar het goede antwoord en de uitleg pas bij onthuld", () => {
    const open = view(state({ type: "toon" }), MEEKIJKER);
    expect(open.question).toMatchObject({ text: Q1.text, options: Q1.options, correct: null, explanation: null });
    const json = JSON.stringify(open);
    expect(json).not.toContain("Altijd op donderdag");
    expect(json).not.toContain("Geheime notitie");
    expect(json).not.toContain("Daan Proef");
    // Other teams only show that they answered.
    expect(open.teams.map((team) => [team.id, team.answered, team.result])).toEqual([
      ["oranje", true, null],
      ["petrol", true, null],
    ]);
    expect(json).not.toContain('"choice"');
    expect(open.me).toMatchObject({ role: "meekijker", answer: null, teamAnswered: true, captainName: "Sanne", canAnswer: false });

    const closed = view(state({ type: "toon" }, { type: "sluit" }), CAPTAIN);
    expect(closed.question?.correct).toBeNull();

    const revealed = view(state({ type: "toon" }, { type: "sluit" }, { type: "onthul" }), BEZOEKER);
    expect(revealed.question).toMatchObject({ correct: 2, explanation: "Altijd op donderdag." });
    expect(revealed.teams.find((team) => team.id === "oranje")?.result).toMatchObject({ twelfths: 12, correct: true, answer: { choice: 2 } });
    // The joker of Petrol is on round 1: its points count double, here none.
    expect(revealed.teams.find((team) => team.id === "petrol")?.result).toMatchObject({ twelfths: 0, twelfthsWithJoker: 0 });
    expect(JSON.stringify(revealed)).not.toContain("Geheime notitie");
  });

  it("geeft extra foto's alleen samen met de eerste foto, dus nooit voor open", () => {
    const extra = { photoUrl: "/api/foto/een?t=1&s=x", extraPhotoUrls: ["/api/foto/twee?t=1&s=y", "/api/foto/drie?t=1&s=z"] };
    const open = view(state({ type: "toon" }), MEEKIJKER, extra);
    expect(open.question).toMatchObject({ photoUrl: extra.photoUrl, extraPhotoUrls: extra.extraPhotoUrls });
    // The caller signs nothing before open; even if it passed extra links, they don't go out without the first photo.
    const zonderEerste = view(state({ type: "toon" }), MEEKIJKER, { photoUrl: null, extraPhotoUrls: extra.extraPhotoUrls });
    expect(zonderEerste.question?.extraPhotoUrls).toEqual([]);
    expect(JSON.stringify(view(state(), CAPTAIN, extra))).not.toContain("/api/foto/twee");
  });

  it("geeft de captain zijn eigen antwoord, en laat hem alleen kiezen terwijl de vraag open is", () => {
    const open = view(state({ type: "toon" }), CAPTAIN);
    expect(open.me).toMatchObject({ role: "captain", answer: { choice: 2 }, canAnswer: true });
    const closed = view(state({ type: "toon" }, { type: "sluit" }), CAPTAIN);
    expect(closed.me.canAnswer).toBe(false);
  });

  it("sluit na de tien seconden, ook als niemand op sluiten drukte", () => {
    const counting = state({ type: "toon" }, { type: "nog10" });
    expect(view(counting, CAPTAIN).countdownMs).toBe(10_000);
    const later = buildQuizView({ ...inputFor(counting, CAPTAIN), now: NOW + 10_001 });
    expect(later).toMatchObject({ phase: "gesloten", countdownMs: null, me: { canAnswer: false } });
  });

  it("toont meekijkers in de luistermodus alleen Luister goed; captains houden de antwoorden", () => {
    const listening = state(
      { type: "toon" },
      { type: "sluit" },
      { type: "onthul" },
      { type: "volgende" },
      { type: "sluit" },
      { type: "onthul" },
      { type: "volgende" },
      { type: "volgendeRonde" },
      { type: "toon" },
    );
    expect(listening.listening).toBe(true);
    for (const viewer of [MEEKIJKER, BEZOEKER]) {
      const phone = view(listening, viewer, { answers: {} });
      expect(phone).toMatchObject({ luisterGoed: true, question: null, questionAt: { number: 1, count: 1 } });
      expect(JSON.stringify(phone)).not.toContain(Q3.text);
      expect(viewerSeesQuestion(listening, NOW, viewer.role)).toBe(false);
    }
    const captain = view(listening, CAPTAIN, { answers: {} });
    expect(captain).toMatchObject({ luisterGoed: false, question: { text: Q3.text } });
    expect(viewerSeesQuestion(listening, NOW, "captain")).toBe(true);
    // At the reveal everyone sees the answer again.
    const revealed = view(transitionOk(listening, { type: "sluit" }, { type: "onthul" }), MEEKIJKER, { answers: {} });
    expect(revealed).toMatchObject({ luisterGoed: false, question: { correct: 1 } });
  });

  it("laat de captain de joker alleen inzetten op het rondescherm, en maar één keer", () => {
    expect(view(state(), CAPTAIN, { jokers: {} }).me.canJoker).toBe(true);
    expect(view(state(), CAPTAIN, { jokers: { oranje: 1 } }).me.canJoker).toBe(false);
    expect(view(state(), MEEKIJKER, { jokers: {} }).me.canJoker).toBe(false);
    expect(view(state({ type: "toon" }), CAPTAIN, { jokers: {} }).me.canJoker).toBe(false);
    expect(view(state(), CAPTAIN).jokers).toEqual([{ teamId: "petrol", name: "Team Petrol", color: "petrol", round: 1 }]);
  });

  it("verstopt de tussenstand als het scorebord op slot zit", () => {
    const standing = state({ type: "toon" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" }, { type: "sluit" }, { type: "onthul" }, { type: "volgende" });
    const standings = quizStandings(CONTENT, { q1: ANSWERS }, { petrol: 1 }, ["oranje", "petrol"]);
    const open = view(standing, MEEKIJKER, { standings });
    expect(open.standings?.map((row) => [row.name, row.place, row.twelfths])).toEqual([
      ["Team Oranje", 1, 12],
      ["Team Petrol", 2, 0],
    ]);
    expect(open.nextRound).toEqual({ number: 3, title: "Muziek", intermezzoFirst: false });
    const locked = view(standing, MEEKIJKER, { standings, lockClosed: true });
    expect(locked).toMatchObject({ standings: null, standingsHidden: true });
  });

  it("toont niets van een quiz die niet loopt", () => {
    const rest = view(REST, CAPTAIN, { content: null });
    expect(rest).toMatchObject({ status: "rust", phase: null, question: null, round: null });
  });
});

describe("de console van de quizmaster", () => {
  it("markeert het goede antwoord en toont de notitie, alleen hier", () => {
    const open = state({ type: "toon" });
    const consoleView = buildConsoleView({
      env: "test",
      version: 3,
      now: NOW,
      state: open,
      content: CONTENT,
      quizzes: [],
      teams: TEAMS,
      answers: { q1: ANSWERS },
      jokers: {},
      standings: [],
      fairnessLines: { 1: "Voorkennis per team: Oranje 1, Petrol 0" },
      submitters: {},
      photoUrl: null,
      reviewId: null,
      canRestart: true,
      botsAllowed: true,
    });
    expect(consoleView.question).toMatchObject({ correctChoice: 2, correctLabel: "C: Donderdag", note: "Geheime notitie" });
    expect(consoleView.buttons.main).toEqual({ command: "sluit", label: "Sluit de vraag" });
    expect(consoleView.answeredCount).toBe(2);
    // While the question is open the console shows who answered, not what.
    expect(consoleView.teams.map((team) => team.answerLabel)).toEqual([null, null]);
    expect(consoleView.fairness).toBe("Voorkennis per team: Oranje 1, Petrol 0");
    expect(consoleView.upNext).toBeNull();
  });
});

function inputFor(engine: EngineState, viewer: Viewer): PhoneViewInput {
  return {
    env: "test",
    version: 7,
    now: NOW,
    state: engine,
    lockClosed: false,
    content: CONTENT,
    teams: TEAMS,
    answers: ANSWERS,
    jokers: {},
    standings: null,
    viewer,
    photoUrl: null,
    submitter: null,
  };
}

function transitionOk(engine: EngineState, ...commands: Command[]): EngineState {
  let current = engine;
  for (const command of commands) {
    const result = transition(normalize(current, NOW), CONTENT, command, NOW);
    if (!result.ok) throw new Error(result.error);
    current = result.state;
  }
  return current;
}
