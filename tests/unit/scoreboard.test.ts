/**
 * The scoreboard as the server assembles it from the raw rows (events,
 * results, jokers, bonus points, quiz answers and duels), with the numbers
 * of SPEC §5.5, and what each role may see while the lock is closed.
 */
import { describe, expect, it } from "vitest";
import { ceremonyView } from "@/lib/server/ceremony";
import {
  assembleScoreboard,
  liveView,
  lockedView,
  summaryLine,
  surpriseView,
  toQuestion,
  type EventInfo,
  type QuizAnswerRow,
  type ScoreboardInput,
} from "@/lib/server/scoreboard";
import { formatPoints } from "@/lib/shared/scoring";

const TEAMS = [
  { id: "oranje", name: "Team Oranje", color: "oranje", sort: 1 },
  { id: "mosterd", name: "Team Mosterd", color: "mosterd", sort: 2 },
  { id: "avocado", name: "Team Avocado", color: "avocado", sort: 3 },
  { id: "petrol", name: "Team Petrol", color: "petrol", sort: 4 },
] as const;

const p = (points: number) => points * 12;

function event(id: string, kind: EventInfo["kind"], sort: number, extra: Partial<EventInfo> = {}): EventInfo {
  return {
    id,
    kind,
    name: id,
    description: null,
    sort,
    resultType: kind === "vrijdag" ? "vrij" : null,
    unit: null,
    mode: "tegelijk",
    pointsTable: null,
    jokerAllowed: kind === "zeskamp" || kind === "quiz",
    countsForMedals: kind !== "intermezzo",
    status: "gepland",
    startedAt: null,
    startedBy: null,
    finishedAt: null,
    ...extra,
  };
}

/** Quiz points per round (SPEC §5.5): Mosterd plays its joker in round 4 (5 → 10). */
const QUIZ_PER_ROUND: Record<string, number[]> = {
  oranje: [8, 7, 9, 6, 8],
  mosterd: [7, 8, 6, 5, 10],
  avocado: [6, 7, 7, 6, 7],
  petrol: [8, 6, 7, 8, 7],
};

/** Ten multiple-choice questions per round; a team gets its points right and the rest wrong. */
function quizAnswers(): QuizAnswerRow[] {
  const rows: QuizAnswerRow[] = [];
  for (let round = 1; round <= 5; round += 1) {
    for (let question = 0; question < 10; question += 1) {
      for (const team of TEAMS) {
        rows.push({
          questionId: `r${round}v${question}`,
          teamId: team.id,
          roundNo: round,
          kind: "meerkeuze",
          correct: 2,
          scale: null,
          answer: { choice: question < QUIZ_PER_ROUND[team.id][round - 1] ? 2 : 0 },
          overrideTwelfths: null,
        });
      }
    }
  }
  return rows;
}

/** The six zeskamp games with raw results that give the placements of §5.5. */
const GAMES = [
  { id: "spel-1", type: "tijd", joker: "petrol", values: { oranje: 44.87, mosterd: 43.05, avocado: 52.1, petrol: 41.2 } },
  { id: "spel-2", type: "aantal_hoog", joker: "oranje", values: { oranje: 14, mosterd: 9, avocado: 11, petrol: 6 } },
  { id: "spel-3", type: "meting_hoog", joker: null, values: { oranje: 120, mosterd: 142, avocado: 142, petrol: 97 } },
  { id: "spel-4", type: "meting_laag", joker: null, values: { oranje: 18, mosterd: 40, avocado: 12, petrol: 25 } },
  { id: "spel-5", type: "plaatsen", joker: "mosterd", values: { oranje: 3, mosterd: 1, avocado: 4, petrol: 2 } },
  { id: "spel-6", type: "jury", joker: "avocado", values: { oranje: 9, mosterd: 8, avocado: 7, petrol: 5 } },
] as const;

function weekend(options: { zeskamp?: boolean } = {}): ScoreboardInput {
  const zeskamp = options.zeskamp ?? true;
  const vrijdag = { oranje: 8, mosterd: 5, avocado: 10, petrol: 6 };
  return {
    env: "live",
    teams: TEAMS.map((team) => ({ ...team })),
    events: [
      event("quiz", "quiz", 1),
      event("intermezzo", "intermezzo", 2),
      event("vrijdag", "vrijdag", 3, { name: "Spelletjesmiddag" }),
      ...GAMES.map((game, index) =>
        event(game.id, "zeskamp", 11 + index, { resultType: game.type, status: zeskamp ? "klaar" : "gepland", name: `Spel ${index + 1}` }),
      ),
    ],
    results: [
      ...TEAMS.map((team) => ({
        eventId: "vrijdag",
        teamId: team.id,
        rawValue: null,
        freeTwelfths: p(vrijdag[team.id]),
        enteredBy: "Beheerder",
        enteredAt: "2027-05-07T15:00:00.000Z",
        clientId: null,
      })),
      ...(zeskamp
        ? GAMES.flatMap((game) =>
            TEAMS.map((team) => ({
              eventId: game.id,
              teamId: team.id,
              rawValue: game.values[team.id],
              freeTwelfths: null,
              enteredBy: "Kees",
              enteredAt: "2027-05-08T10:40:00.000Z",
              clientId: `client-${game.id}`,
            })),
          )
        : []),
    ],
    jokers: [
      { teamId: "mosterd", kind: "quiz", roundNo: 4, eventId: null, setAt: "2027-05-06T19:00:00.000Z", setBy: "captain" },
      ...GAMES.filter((game) => game.joker).map((game) => ({
        teamId: game.joker!,
        kind: "zeskamp" as const,
        roundNo: null,
        eventId: game.id,
        setAt: "2027-05-08T09:00:00.000Z",
        setBy: "captain",
      })),
    ],
    bonus: [],
    quizAnswers: quizAnswers(),
    duelWinners: [],
    zeskampPoints: [10, 7, 5, 3],
    intermezzoPoints: 1,
    quizBusy: false,
  };
}

const row = (board: ReturnType<typeof assembleScoreboard>, team: string) => board.standings.find((r) => r.team.id === team)!;

describe("§5.5 via de server: stand na vrijdag", () => {
  const board = assembleScoreboard(weekend({ zeskamp: false }));

  it("telt de quiz uit de antwoorden, met de joker van Mosterd in ronde 4", () => {
    const quiz = TEAMS.map((team) => formatPoints(row(board, team.id).breakdown.find((b) => b.kind === "quiz")!.twelfths));
    expect(quiz).toEqual(["38", "41", "33", "36"]);
    expect(row(board, "mosterd").breakdown.find((b) => b.kind === "quiz")?.joker).toBe(true);
  });

  it("zet Oranje en Mosterd gedeeld op 1 met 46, Avocado 3e met 43 en Petrol 4e met 42", () => {
    expect(board.standings.map((r) => [r.place, r.team.name, formatPoints(r.twelfths), r.shared])).toEqual([
      [1, "Team Oranje", "46", true],
      [1, "Team Mosterd", "46", true],
      [3, "Team Avocado", "43", false],
      [4, "Team Petrol", "42", false],
    ]);
  });

  it("schrijft de opbouw als in het ontwerp: Quiz 41 met joker, vrijdag 5", () => {
    expect(summaryLine(row(board, "mosterd").breakdown).replace(/ /g, " ")).toBe("Quiz 41 met joker, vrijdag 5");
    expect(summaryLine(row(board, "oranje").breakdown)).not.toMatch(/ \S+$/);
  });

  it("geeft geen zeskamppunten en markeert de spellen als gepland", () => {
    expect(board.parts.filter((part) => part.kind === "zeskamp").every((part) => !part.played && part.status === "gepland")).toBe(true);
    expect(board.empty).toBe(false);
  });
});

describe("§5.5 via de server: eindstand en medaillespiegel", () => {
  const board = assembleScoreboard(weekend());

  it("eindigt met 1 Oranje 98, 2 Mosterd 96,5, 3 Avocado 84,5, 4 Petrol 83", () => {
    expect(board.standings.map((r) => [r.place, r.team.name, formatPoints(r.twelfths)])).toEqual([
      [1, "Team Oranje", "98"],
      [2, "Team Mosterd", "96,5"],
      [3, "Team Avocado", "84,5"],
      [4, "Team Petrol", "83"],
    ]);
  });

  it("maakt de medaillespiegel: Mosterd 3-2-1, Avocado 3-1-1, Oranje 2-3-3, Petrol 1-1-3", () => {
    expect(board.medals.map((m) => [m.team.name, m.gold, m.silver, m.bronze])).toEqual([
      ["Team Mosterd", 3, 2, 1],
      ["Team Avocado", 3, 1, 1],
      ["Team Oranje", 2, 3, 3],
      ["Team Petrol", 1, 1, 3],
    ]);
  });

  it("geeft de plaatsen en punten per spel, met gedeelde plaatsen en jokers", () => {
    const spel3 = board.games["spel-3"].map((g) => [g.place, g.teamId, formatPoints(g.twelfths), g.shared]);
    expect(spel3).toEqual([
      [1, "mosterd", "8,5", true],
      [1, "avocado", "8,5", true],
      [3, "oranje", "5", false],
      [4, "petrol", "3", false],
    ]);
    const spel6 = board.games["spel-6"].find((g) => g.teamId === "avocado");
    expect(spel6).toMatchObject({ place: 3, twelfths: p(10), joker: true });
    expect(row(board, "avocado").breakdown.find((b) => b.partId === "spel-6")).toMatchObject({ medal: "brons", joker: true, place: 3 });
  });

  it("noemt de gebruikte jokers", () => {
    expect(board.jokers.filter((j) => j.used).map((j) => `${j.teamId} ${j.label}`)).toEqual([
      "mosterd de quiz (ronde 4)",
      "petrol spel 1",
      "oranje spel 2",
      "mosterd spel 5",
      "avocado spel 6",
    ]);
  });
});

describe("onderdelen samenstellen", () => {
  it("laat een correctie van de quizmaster voorgaan op de berekende punten", () => {
    const input = weekend({ zeskamp: false });
    input.quizAnswers = input.quizAnswers.map((a) =>
      a.questionId === "r1v9" && a.teamId === "petrol" ? { ...a, overrideTwelfths: 12 } : a,
    );
    const board = assembleScoreboard(input);
    expect(formatPoints(row(board, "petrol").breakdown[0].twelfths)).toBe("37");
  });

  it("geeft bij een schatting de dichtstbijzijnde teams een punt en rekent een kaartvraag met de schaal", () => {
    const input: ScoreboardInput = {
      ...weekend({ zeskamp: false }),
      results: [],
      jokers: [],
      quizAnswers: [
        ...["oranje", "mosterd", "avocado", "petrol"].map((teamId, index) => ({
          questionId: "schat",
          teamId,
          roundNo: 1,
          kind: "schatting",
          correct: 39,
          scale: null,
          answer: { number: [35, 43, 39, 50][index] },
          overrideTwelfths: null,
        })),
        { questionId: "kaart", teamId: "oranje", roundNo: 1, kind: "kaart", correct: { lat: 50.865, lng: 5.832 }, scale: "nederland", answer: { lat: 50.87, lng: 5.83 }, overrideTwelfths: null },
      ],
    };
    const board = assembleScoreboard(input);
    const quiz = (team: string) => row(board, team).breakdown.find((b) => b.kind === "quiz")!.twelfths;
    expect([quiz("oranje"), quiz("mosterd"), quiz("avocado"), quiz("petrol")]).toEqual([p(3), 0, p(1), 0]);
    expect(toQuestion("kaart", { lat: 1, lng: 2 }, null)).toBeNull();
    expect(toQuestion("waar_niet_waar", true, null)).toEqual({ type: "waar_niet_waar", correct: { bool: true } });
    expect(toQuestion("echt_of_ai", "ai", null)).toEqual({ type: "echt_of_ai", correct: { realOrAi: "ai" } });
  });

  it("telt gewonnen duels als intermezzo, zonder medailles", () => {
    const input = { ...weekend({ zeskamp: false }), duelWinners: ["avocado", "avocado", "petrol", null], intermezzoPoints: 2 };
    const board = assembleScoreboard(input);
    expect(row(board, "avocado").breakdown.find((b) => b.kind === "intermezzo")?.twelfths).toBe(p(4));
    expect(row(board, "oranje").breakdown.find((b) => b.kind === "intermezzo")?.twelfths).toBe(0);
    expect(board.medals).toEqual(assembleScoreboard(weekend({ zeskamp: false })).medals);
  });

  it("zet losse punten met hun reden in de opbouw, ook een negatief getal", () => {
    const input = {
      ...weekend(),
      bonus: [
        { id: "b1", teamId: "petrol", twelfths: -24, reason: "Voorzeggen", givenBy: "Beheerder", createdAt: "2027-05-08T12:00:00.000Z" },
        { id: "b2", teamId: "petrol", twelfths: 6, reason: "Mooiste yel", givenBy: "Beheerder", createdAt: "2027-05-08T12:05:00.000Z" },
      ],
    };
    const board = assembleScoreboard(input);
    const los = row(board, "petrol").breakdown.find((b) => b.kind === "los");
    expect(los?.twelfths).toBe(-18);
    expect(los?.reasons.map((r) => [r.reason, formatPoints(r.twelfths)])).toEqual([
      ["Voorzeggen", "-2"],
      ["Mooiste yel", "0,5"],
    ]);
    expect(formatPoints(row(board, "petrol").twelfths)).toBe("81,5");
    expect(row(board, "oranje").breakdown.some((b) => b.kind === "los")).toBe(false);
  });

  it("verdubbelt elke joker op een spel, maar niet waar de joker niet mag", () => {
    const input = weekend();
    input.jokers.push({ teamId: "oranje", kind: "zeskamp", roundNo: null, eventId: "spel-1", setAt: "", setBy: "x" });
    input.jokers = input.jokers.filter((j) => !(j.teamId === "oranje" && j.eventId === "spel-2"));
    const twee = assembleScoreboard(input).games["spel-1"];
    expect(twee.filter((g) => g.joker).map((g) => [g.teamId, formatPoints(g.twelfths)])).toEqual([
      ["petrol", "20"],
      ["oranje", "10"],
    ]);
    input.events = input.events.map((e) => (e.id === "spel-1" ? { ...e, jokerAllowed: false } : e));
    expect(assembleScoreboard(input).games["spel-1"].every((g) => !g.joker)).toBe(true);
  });

  it("laat een team zonder uitslag zonder plaats en punten", () => {
    const input = weekend();
    input.results = input.results.filter((r) => !(r.eventId === "spel-4" && r.teamId === "mosterd"));
    const spel4 = assembleScoreboard(input).games["spel-4"];
    expect(spel4.find((g) => g.teamId === "mosterd")).toMatchObject({ place: null, twelfths: 0 });
  });

  it("is leeg zonder punten", () => {
    const board = assembleScoreboard({ ...weekend({ zeskamp: false }), results: [], quizAnswers: [], jokers: [] });
    expect(board.empty).toBe(true);
    expect(board.standings.every((r) => r.place === 1 && r.shared && r.twelfths === 0)).toBe(true);
  });
});

describe("het slot: wat iedereen ziet", () => {
  const before = assembleScoreboard(weekend({ zeskamp: false }));
  const now = assembleScoreboard(weekend());
  const live = { lockClosed: true, lockClosedAt: "2027-05-08T08:30:00.000Z" };
  const snapshotView = liveView(before, { lockClosed: false, lockClosedAt: null }, false);
  const snapshot = {
    takenAt: "2027-05-08T08:30:00.000Z",
    standings: snapshotView.standings,
    medals: snapshotView.medals,
    parts: snapshotView.parts,
    jokers: snapshotView.jokers,
  };

  it("toont tijdens het slot de momentopname en geen punt van na het slot", () => {
    const view = lockedView(now, live, snapshot);
    expect(view.show).toBe("momentopname");
    expect(view.standings.map((r) => formatPoints(r.twelfths ?? 0))).toEqual(["46", "46", "43", "42"]);
    const json = JSON.stringify(view);
    // The real totals and the zeskamp points never leave the server.
    for (const total of [1176, 1158, 1014, 996, 624, 606]) expect(json).not.toContain(`"twelfths":${total}`);
    expect(view.standings.flatMap((r) => r.breakdown).some((b) => b.kind === "zeskamp")).toBe(false);
    expect(view.medals.map((m) => [m.team.name, m.gold, m.silver, m.bronze])).toEqual(
      snapshotView.medals.map((m) => [m.team.name, m.gold, m.silver, m.bronze]),
    );
  });

  it("laat wel zien welke spellen gespeeld zijn en welke jokers gebruikt zijn", () => {
    const view = lockedView(now, live, snapshot);
    expect(view.parts.filter((part) => part.kind === "zeskamp").every((part) => part.status === "klaar")).toBe(true);
    expect(view.jokers.map((j) => `${j.team.name} bij ${j.label}`)).toContain("Team Petrol bij spel 1");
  });

  it("toont zonder momentopname alleen namen", () => {
    const view = lockedView(now, live, null);
    expect(view.standings.every((r) => r.twelfths === null && r.place === null)).toBe(true);
    expect(view.medals.every((m) => m.gold === null)).toBe(true);
  });

  it("vervaagt voor de beheerder die verrast wil worden: geen punten, plaatsen of volgorde", () => {
    const view = surpriseView(now, live);
    expect(view.standings.map((r) => r.team.name)).toEqual(["Team Oranje", "Team Mosterd", "Team Avocado", "Team Petrol"]);
    expect(JSON.stringify(view)).not.toMatch(/"twelfths":-?\d/);
    expect(view.medalLeaders).toEqual([]);
  });

  it("houdt een joker op een spel dat nog niet begon geheim", () => {
    const input = weekend({ zeskamp: false });
    input.jokers.push({ teamId: "oranje", kind: "zeskamp", roundNo: null, eventId: "spel-3", setAt: "", setBy: "x" });
    const board = assembleScoreboard(input);
    expect(liveView(board, { lockClosed: false, lockClosedAt: null }, false).jokers.some((j) => j.team.id === "oranje" && j.kind === "zeskamp")).toBe(false);
    expect(liveView(board, { lockClosed: false, lockClosedAt: null }, true).jokers.some((j) => j.team.id === "oranje" && j.kind === "zeskamp")).toBe(true);
  });
});

describe("prijsuitreiking: wat een telefoon per stap krijgt", () => {
  const board = assembleScoreboard(weekend());
  const state = { active: true, finished: false, lockClosed: true, admin: false };

  it("onthult van onder naar boven, zonder de rest te verraden", () => {
    const intro = ceremonyView(board, 0, state);
    expect(intro.current).toBe("intro");
    expect(intro.revealed).toEqual([]);
    expect(JSON.stringify(intro)).not.toContain("Team");

    const vier = ceremonyView(board, 1, state);
    expect(vier.revealed.map((g) => [g.place, g.teams.map((t) => t.team.name)])).toEqual([[4, ["Team Petrol"]]]);
    expect(JSON.stringify(vier)).not.toMatch(/Team (Oranje|Mosterd|Avocado)/);

    const trom = ceremonyView(board, 4, state);
    expect(trom.current).toBe("trom");
    expect(trom.hidden).toBe(1);
    expect(trom.winners).toBeNull();
    expect(JSON.stringify(trom)).not.toContain("Team Oranje");
  });

  it("toont de winnaar met het podium, en daarna de eindstand en de medaillespiegel", () => {
    const winnaar = ceremonyView(board, 5, state);
    expect(winnaar.winners?.teams.map((t) => t.team.name)).toEqual(["Team Oranje"]);
    expect(winnaar.podium?.map((b) => [b.place, b.medal, b.teams.map((t) => t.team.name)])).toEqual([
      [1, "goud", ["Team Oranje"]],
      [2, "zilver", ["Team Mosterd"]],
      [3, "brons", ["Team Avocado"]],
    ]);
    expect(winnaar.final).toBeNull();
    const einde = ceremonyView(board, 6, { ...state, admin: true });
    expect(einde.final?.medalLeaders.map((t) => t.name)).toEqual(["Team Mosterd"]);
    expect(einde.admin?.next).toBe("Sluit de prijsuitreiking af");
  });

  it("onthult gedeelde plaatsen tegelijk", () => {
    const gedeeld = assembleScoreboard(weekend({ zeskamp: false }));
    const plan = ceremonyView(gedeeld, 1, { ...state, admin: true });
    expect(plan.revealed).toEqual([{ place: 4, shared: false, teams: [expect.objectContaining({ team: expect.objectContaining({ name: "Team Petrol" }) })] }]);
    expect(plan.admin?.next).toBe("Onthul plaats 3");
    const winnaars = ceremonyView(gedeeld, 4, state);
    expect(winnaars.current).toBe("winnaar");
    expect(winnaars.winners?.shared).toBe(true);
    expect(winnaars.winners?.teams.map((t) => t.team.name)).toEqual(["Team Oranje", "Team Mosterd"]);
  });
});
