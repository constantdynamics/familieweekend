import { describe, expect, it } from "vitest";
import {
  RPS_CHOICES,
  drawChallenger,
  drawFirstPair,
  duelOutcome,
  isRpsChoice,
  markPlayed,
  streaks,
  type RpsChoice,
  type RpsPlayer,
} from "@/lib/shared/rps";

/** Mulberry32: a small seeded RNG, so every run draws the same. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const always = (value: number) => () => value;

const PLAYERS: RpsPlayer[] = [
  { id: "sanne", team: "Oranje" },
  { id: "piet", team: "Oranje" },
  { id: "kees", team: "Mosterd" },
  { id: "lotte", team: "Avocado" },
];

/** Four teams of three. */
const FAMILY: RpsPlayer[] = ["Oranje", "Mosterd", "Avocado", "Petrol"].flatMap((team) =>
  [1, 2, 3].map((n) => ({ id: `${team.toLowerCase()}-${n}`, team })),
);
const teamOf = (id: string) => FAMILY.find((player) => player.id === id)?.team;

describe("steen, papier, schaar", () => {
  it("steen wint van schaar, schaar van papier, papier van steen", () => {
    const table = RPS_CHOICES.flatMap((a) => RPS_CHOICES.map((b) => `${a}-${b}: ${duelOutcome(a, b)}`));
    expect(table).toEqual([
      "steen-steen: gelijk",
      "steen-papier: b",
      "steen-schaar: a",
      "papier-steen: a",
      "papier-papier: gelijk",
      "papier-schaar: b",
      "schaar-steen: b",
      "schaar-papier: a",
      "schaar-schaar: gelijk",
    ]);
  });

  it("laat een onzinkeuze verliezen", () => {
    const rots = "rots" as RpsChoice;
    expect(duelOutcome(rots, "steen")).toBe("b");
    expect(duelOutcome("papier", rots)).toBe("a");
    expect(duelOutcome(rots, "vuur" as RpsChoice)).toBe("gelijk");
    expect(isRpsChoice("schaar")).toBe(true);
    expect(isRpsChoice("Schaar")).toBe(false);
    expect(isRpsChoice(null)).toBe(false);
  });
});

describe("loten", () => {
  it("loot de eerste twee spelers uit twee verschillende teams", () => {
    expect(drawFirstPair(PLAYERS, always(0))).toEqual([PLAYERS[0], PLAYERS[2]]);
    expect(drawFirstPair(PLAYERS, always(0.999))).toEqual([PLAYERS[2], PLAYERS[3]]);
    const rng = seeded(2027);
    for (let i = 0; i < 500; i += 1) {
      const pair = drawFirstPair(FAMILY, rng);
      expect(pair).not.toBeNull();
      expect(pair?.[0].team).not.toBe(pair?.[1].team);
    }
  });

  it("kan elk paar uit verschillende teams loten, en nooit een paar uit één team", () => {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const pair = drawFirstPair(PLAYERS, rng);
      seen.add(`${pair?.[0].id}+${pair?.[1].id}`);
    }
    expect([...seen].sort()).toEqual(["kees+lotte", "piet+kees", "piet+lotte", "sanne+kees", "sanne+lotte"]);
  });

  it("geeft null als er geen twee teams zijn", () => {
    expect(drawFirstPair([], always(0))).toBeNull();
    expect(drawFirstPair([PLAYERS[0]], always(0))).toBeNull();
    expect(drawFirstPair(PLAYERS.slice(0, 2), always(0))).toBeNull();
  });

  it("blijft binnen de lijst bij een RNG die 1, iets negatiefs of NaN geeft", () => {
    for (const value of [1, -0.5, Number.NaN]) {
      const pair = drawFirstPair(PLAYERS, always(value));
      expect(pair).not.toBeNull();
      expect(drawChallenger(PLAYERS, "sanne", new Set(), always(value))).not.toBeNull();
    }
  });

  it("geeft de eigen spelersobjecten terug", () => {
    const players = PLAYERS.map((player) => ({ ...player, name: player.id.toUpperCase() }));
    expect(drawFirstPair(players, always(0))?.[0].name).toBe("SANNE");
    expect(drawChallenger(players, "sanne", new Set(), always(0))?.name).toBe("KEES");
  });
});

describe("uitdager loten", () => {
  it("loot nooit iemand uit het team van de kampioen", () => {
    const rng = seeded(42);
    for (const champion of FAMILY) {
      for (let i = 0; i < 100; i += 1) {
        const challenger = drawChallenger(FAMILY, champion.id, new Set(), rng);
        expect(challenger?.team).not.toBe(champion.team);
      }
    }
  });

  it("slaat over wie al gespeeld heeft", () => {
    // sanne en kees speelden het eerste duel; sanne won.
    const played = new Set(["sanne", "kees"]);
    expect(drawChallenger(PLAYERS, "sanne", played, always(0))).toEqual(PLAYERS[3]);
    expect(drawChallenger(PLAYERS, "sanne", played, always(0.999))).toEqual(PLAYERS[3]);
  });

  it("begint opnieuw als iedereen uit de andere teams geweest is", () => {
    const played = new Set(["sanne", "kees", "lotte"]);
    expect(drawChallenger(PLAYERS, "sanne", played, always(0))).toEqual(PLAYERS[2]);
    expect(drawChallenger(PLAYERS, "sanne", played, always(0.999))).toEqual(PLAYERS[3]);
  });

  it("geeft null als er niemand uit een ander team is, of de kampioen onbekend is", () => {
    expect(drawChallenger(PLAYERS.slice(0, 2), "sanne", new Set(), always(0))).toBeNull();
    expect(drawChallenger(PLAYERS, "onbekend", new Set(), always(0))).toBeNull();
  });

  it("houdt bij wie geweest is en begint een nieuwe ronde als iedereen gespeeld heeft", () => {
    let played = markPlayed(PLAYERS, new Set(), ["sanne", "kees"]);
    expect([...played]).toEqual(["sanne", "kees"]);
    // lotte daagt sanne uit en wint.
    played = markPlayed(PLAYERS, played, ["sanne", "lotte"]);
    expect(drawChallenger(PLAYERS, "lotte", played, always(0))).toEqual(PLAYERS[1]);
    // piet is de laatste: daarna begint een nieuwe ronde met alleen dit duel.
    const before = played;
    played = markPlayed(PLAYERS, played, ["lotte", "piet"]);
    expect([...played]).toEqual(["lotte", "piet"]);
    expect([...before]).toEqual(["sanne", "kees", "lotte"]);
    // piet wint: de net verslagen lotte komt niet meteen terug.
    expect(drawChallenger(PLAYERS, "piet", played, always(0.999))).toEqual(PLAYERS[2]);
  });

  it("laat in een heel intermezzo iedereen spelen voordat iemand terugkomt", () => {
    const rng = seeded(1966);
    const pair = drawFirstPair(FAMILY, rng);
    if (!pair) throw new Error("geen paar");
    let champion = pair[rng() < 0.5 ? 0 : 1].id;
    let played = markPlayed(FAMILY, new Set(), [pair[0].id, pair[1].id]);
    const everyone = new Set(played);
    for (let duel = 0; duel < 60; duel += 1) {
      const challenger = drawChallenger(FAMILY, champion, played, rng);
      if (!challenger) throw new Error("geen uitdager");
      expect(challenger.team).not.toBe(teamOf(champion));
      if (played.has(challenger.id)) {
        // Only allowed once all players of the other teams have had their turn.
        const others = FAMILY.filter((player) => player.team !== teamOf(champion));
        expect(others.every((player) => played.has(player.id))).toBe(true);
      }
      played = markPlayed(FAMILY, played, [champion, challenger.id]);
      everyone.add(challenger.id);
      if (rng() < 0.5) champion = challenger.id;
    }
    expect(everyone.size).toBe(FAMILY.length);
  });
});

describe("reeksen", () => {
  it("telt de huidige en de langste reeks: Sanne: 5 op rij!", () => {
    const winners = ["piet", "sanne", "sanne", "sanne", "sanne", "sanne"];
    expect(streaks(winners)).toEqual({ current: { player: "sanne", count: 5 }, longest: { player: "sanne", count: 5 } });
    const result = streaks(winners);
    expect(result.current).not.toBe(result.longest);
  });

  it("onthoudt de langste reeks als een ander het overneemt", () => {
    expect(streaks(["kees", "kees", "kees", "lotte", "sanne"])).toEqual({
      current: { player: "sanne", count: 1 },
      longest: { player: "kees", count: 3 },
    });
  });

  it("laat een even lange reeks later de langste niet overnemen", () => {
    expect(streaks(["kees", "kees", "lotte", "lotte"])).toEqual({
      current: { player: "lotte", count: 2 },
      longest: { player: "kees", count: 2 },
    });
  });

  it("telt een speler die later weer wint als nieuwe reeks", () => {
    expect(streaks(["sanne", "sanne", "piet", "sanne"]).current).toEqual({ player: "sanne", count: 1 });
    expect(streaks([])).toEqual({ current: null, longest: null });
  });
});
