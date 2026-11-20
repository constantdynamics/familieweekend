/**
 * Steen, papier, schaar: the intermezzo of the quiz (SPEC §4.7). Pure
 * functions; the random source is passed in, so tests can fix it.
 */

export type RpsChoice = "steen" | "papier" | "schaar";

export const RPS_CHOICES: readonly RpsChoice[] = Object.freeze(["steen", "papier", "schaar"]);

/** What each choice beats. */
const BEATS: Readonly<Record<RpsChoice, RpsChoice>> = { steen: "schaar", schaar: "papier", papier: "steen" };

export function isRpsChoice(value: unknown): value is RpsChoice {
  return value === "steen" || value === "papier" || value === "schaar";
}

/**
 * Who wins a duel: "a", "b" or "gelijk" (then both choose again). A choice
 * that is not steen, papier or schaar loses to one that is.
 */
export function duelOutcome(a: RpsChoice, b: RpsChoice): "a" | "b" | "gelijk" {
  const validA = isRpsChoice(a);
  const validB = isRpsChoice(b);
  if (!validA || !validB) return validA ? "a" : validB ? "b" : "gelijk";
  if (a === b) return "gelijk";
  return BEATS[a] === b ? "a" : "b";
}

export type RpsPlayer = { id: string; team: string };

/** A random number in [0, 1), like Math.random. */
export type Rng = () => number;

/** A random item; an RNG that returns 1, a negative number or NaN still picks an item. */
function pick<T>(items: readonly T[], rng: Rng): T {
  const value = rng();
  const index = Number.isFinite(value) ? Math.floor(value * items.length) : 0;
  return items[Math.min(items.length - 1, Math.max(0, index))];
}

/**
 * The first duel: two players from two different teams, every such pair
 * equally likely. Null when all players are in one team.
 */
export function drawFirstPair<P extends RpsPlayer>(players: readonly P[], rng: Rng): [P, P] | null {
  const pairs: [P, P][] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      if (a.team !== b.team && a.id !== b.id) pairs.push([a, b]);
    }
  }
  return pairs.length > 0 ? pick(pairs, rng) : null;
}

/**
 * The next challenger for the champion: a random player from another team
 * who has not played yet. When every player of the other teams has played,
 * the pool resets and all of them can be drawn again. Null when there is
 * nobody from another team, or the champion is not among the players.
 *
 * `played` holds who has played in the current round; keep it up to date
 * with `markPlayed`.
 */
export function drawChallenger<P extends RpsPlayer>(
  players: readonly P[],
  championId: string,
  played: ReadonlySet<string>,
  rng: Rng,
): P | null {
  const champion = players.find((player) => player.id === championId);
  if (!champion) return null;
  const eligible = players.filter((player) => player.team !== champion.team && player.id !== champion.id);
  if (eligible.length === 0) return null;
  const fresh = eligible.filter((player) => !played.has(player.id));
  return pick(fresh.length > 0 ? fresh : eligible, rng);
}

/**
 * The `played` set after a duel (§4.7: whoever has played waits until
 * everybody has had a turn). Adds the players of the duel to a copy of
 * `played`. Once everybody has played, a new round starts that holds only
 * the players of this duel, so the one who just lost is not drawn again
 * straight away.
 */
export function markPlayed(
  players: readonly RpsPlayer[],
  played: ReadonlySet<string>,
  duelPlayerIds: readonly string[],
): Set<string> {
  const next = new Set(played);
  for (const id of duelPlayerIds) next.add(id);
  return players.every((player) => next.has(player.id)) ? new Set(duelPlayerIds) : next;
}

export type Streak = { player: string; count: number };

/**
 * Winning streaks from the winners of all duels in order, for "Sanne: 5 op
 * rij!". `current` is the streak of the last winner; `longest` is the
 * longest streak so far, and an equal streak later on does not take it over.
 */
export function streaks(winnersInOrder: readonly string[]): { current: Streak | null; longest: Streak | null } {
  let current: Streak | null = null;
  let longest: Streak | null = null;
  for (const winner of winnersInOrder) {
    const count: number = current?.player === winner ? current.count + 1 : 1;
    current = { player: winner, count };
    if (!longest || count > longest.count) longest = current;
  }
  // Copies, so the two never share one object.
  return { current: current && { ...current }, longest: longest && { ...longest } };
}
