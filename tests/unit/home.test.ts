import { describe, expect, it } from "vitest";
import {
  headerLine,
  homeTiles,
  jokerLine,
  jokerStatus,
  liveBanner,
  lockSentence,
  teamLine,
  type OwnTeam,
} from "@/lib/shared/home";
import { at, START, VOORBEELD } from "../support/voorbeeldprogramma";

const ZATERDAG_1142 = Date.parse(at(8, 11, 42));
const RUST = { mode: "rust" as const, lockClosed: false, gamesStarted: false };

describe("de kop van Thuis tijdens het weekend", () => {
  it("zegt op de eerste dag: het is zover", () => {
    expect(headerLine(Date.parse(at(6, 14, 0)), START, VOORBEELD)).toBe("Het is zover! Dag 1 van de Spelen, het is 14:00");
  });

  it("telt de dagen en zegt hoe laat het is", () => {
    expect(headerLine(ZATERDAG_1142, START, VOORBEELD)).toBe("Dag 3 van de Spelen, het is 11:42");
  });

  it("feliciteert de moeders op Moederdag", () => {
    expect(headerLine(Date.parse(at(9, 9, 5)), START, VOORBEELD)).toBe("Fijne Moederdag! Dag 4 van de Spelen, het is 09:05");
    expect(headerLine(Date.parse(at(9, 9, 5)), START, null)).toBe("Dag 4 van de Spelen, het is 09:05");
  });
});

describe("de live-banner", () => {
  it("roept iedereen erbij als er iets loopt", () => {
    expect(liveBanner("quiz")).toEqual({ title: "De quiz is begonnen", text: "Kijk mee, je team heeft je nodig", href: "/quiz" });
    expect(liveBanner("intermezzo")).toMatchObject({ title: "Het intermezzo is begonnen", href: "/quiz" });
    expect(liveBanner("ceremonie")).toMatchObject({ title: "De prijsuitreiking is begonnen", href: "/ceremonie" });
    expect(liveBanner("rust")).toBeNull();
  });
});

describe("de tegels op Thuis", () => {
  it("toont de quiz op de dag van de quiz", () => {
    const tiles = homeTiles(VOORBEELD, Date.parse(at(6, 18, 0)), RUST);
    expect(tiles).toEqual([{ key: "quiz", href: "/quiz", title: "Quiz", text: "Vanavond om 20:00" }]);
  });

  it("toont de quiz ook terwijl hij loopt, met de score zodra de Spelen begonnen zijn", () => {
    const tiles = homeTiles(VOORBEELD, Date.parse(at(6, 20, 40)), { mode: "quiz", lockClosed: false, gamesStarted: true });
    expect(tiles.map((t) => [t.key, t.text])).toEqual([
      ["quiz", "Nu bezig, kijk mee"],
      ["score", "De stand van de Spelen"],
    ]);
  });

  it("toont de zeskamp op zaterdag, en de score op slot", () => {
    const tiles = homeTiles(VOORBEELD, ZATERDAG_1142, { mode: "rust", lockClosed: true, gamesStarted: true });
    expect(tiles.map((t) => [t.key, t.text])).toEqual([
      ["zeskamp", "Nu bezig"],
      ["score", "Op slot"],
    ]);
    expect(homeTiles(VOORBEELD, Date.parse(at(8, 9, 0)), RUST)[0].text).toBe("Vandaag om 10:30");
  });

  it("toont op vrijdag zonder begonnen Spelen geen tegels", () => {
    expect(homeTiles(VOORBEELD, Date.parse(at(7, 11, 0)), RUST)).toEqual([]);
    expect(homeTiles(null, Date.parse(at(7, 11, 0)), RUST)).toEqual([]);
  });
});

describe("het slot van het scorebord", () => {
  it("noemt wanneer de prijsuitreiking is", () => {
    expect(lockSentence(VOORBEELD, ZATERDAG_1142)).toBe(
      "Het scorebord is op slot tot de prijsuitreiking, vanavond om 20:30.",
    );
    expect(lockSentence(VOORBEELD, Date.parse(at(7, 12, 0)))).toBe(
      "Het scorebord is op slot tot de prijsuitreiking, morgen om 20:30.",
    );
    expect(lockSentence(null, ZATERDAG_1142)).toBe("Het scorebord is op slot tot de prijsuitreiking.");
  });
});

describe("je team en de jokers", () => {
  const team: OwnTeam = {
    id: "t1",
    name: "Team Mosterd",
    color: "mosterd",
    members: ["Tim"],
    captain: "Sanne",
    youAreCaptain: false,
    jokers: {
      quiz: { used: true, detail: "ronde 4", over: false },
      zeskamp: { used: false, detail: null, over: false },
    },
  };

  it("zegt bij welk team je speelt", () => {
    expect(teamLine(team)).toBe("Jij speelt bij Team Mosterd");
    expect(teamLine({ ...team, members: ["Tim", "Lotte", "Oma Riet"] })).toBe("Tim, Lotte en Oma Riet spelen bij Team Mosterd");
    expect(teamLine({ ...team, members: [], youAreCaptain: true })).toBe("Jij bent captain van Team Mosterd");
  });

  it("zegt welke joker er nog is, zoals in het ontwerp", () => {
    expect(jokerLine(team)).toBe("Captain Sanne heeft de joker nog voor de zeskamp");
    expect(jokerLine({ ...team, youAreCaptain: true })).toBe("Jij hebt de joker nog voor de zeskamp");
    const allebei = { ...team, jokers: { quiz: { used: false, detail: null, over: false }, zeskamp: team.jokers.zeskamp } };
    expect(jokerLine(allebei)).toBe("Captain Sanne heeft de jokers nog voor de quiz en de zeskamp");
    expect(jokerLine({ ...allebei, captain: null })).toBe("Jullie hebben de jokers nog voor de quiz en de zeskamp");
  });

  it("vergeet een joker van een onderdeel dat al voorbij is", () => {
    const quizVoorbij = { ...team, jokers: { quiz: { used: false, detail: null, over: true }, zeskamp: team.jokers.zeskamp } };
    expect(jokerLine(quizVoorbij)).toBe("Captain Sanne heeft de joker nog voor de zeskamp");
    const op = { ...team, jokers: { quiz: team.jokers.quiz, zeskamp: { used: true, detail: "Skilopen", over: false } } };
    expect(jokerLine(op)).toBe("Jullie jokers zijn allebei ingezet");
    expect(jokerLine({ ...op, jokers: { ...op.jokers, quiz: { used: false, detail: null, over: true } } })).toBe("Jullie jokers zijn op");
  });

  it("beschrijft elke joker op het teamscherm", () => {
    expect(jokerStatus("quiz", team.jokers.quiz)).toBe("Quizjoker: ingezet in ronde 4");
    expect(jokerStatus("zeskamp", { used: true, detail: "Skilopen", over: false })).toBe("Zeskampjoker: ingezet bij Skilopen");
    expect(jokerStatus("zeskamp", team.jokers.zeskamp)).toBe("Zeskampjoker: nog te spelen");
    expect(jokerStatus("quiz", { used: false, detail: null, over: true })).toBe("Quizjoker: niet gebruikt");
  });
});
