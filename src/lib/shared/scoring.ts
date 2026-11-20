/**
 * Points for the whole weekend (SPEC §5): place points per game, the overall
 * standings, the medal table and how points read on screen. Pure functions
 * without I/O, shared by the server and the screens.
 *
 * All points are whole numbers of twelfths (§5.2). Twelve is divisible by 1,
 * 2, 3 and 4, so points shared by up to four teams never need rounding:
 * (10 + 7 + 5) / 3 = 7⅓ points is exactly 88 twelfths. Only `formatPoints`
 * rounds, for display.
 */

/** Twelfths per point: points are stored as `points × 12`. */
export const TWELFTHS = 12;

/** A joker doubles the points of one quiz round or one zeskamp game. */
export const JOKER_FACTOR = 2;

/** Place points of a zeskamp game in whole points, first place first (§5.1). */
export const DEFAULT_PLACE_TABLE: readonly number[] = Object.freeze([10, 7, 5, 3]);

/**
 * How a game is decided (§4.9 "Uitslagtypes"). The lowest value wins for
 * `tijd`, `aantal_laag` and `meting_laag`, the highest for `aantal_hoog`,
 * `meting_hoog` and `jury`. For `plaatsen` the value is the place the referee
 * tapped: 1 is first, and equal values share a place.
 */
export type ResultType =
  | "tijd"
  | "aantal_hoog"
  | "aantal_laag"
  | "meting_hoog"
  | "meting_laag"
  | "plaatsen"
  | "jury";

const LOWEST_WINS: ReadonlySet<ResultType> = new Set<ResultType>(["tijd", "aantal_laag", "meting_laag", "plaatsen"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Own properties only, so a team called "constructor" reads as missing. */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Competition place of `value` among `values` when higher is better: 1, 1, 3, 4. */
function placeAmong(value: number, values: readonly number[]): number {
  return 1 + values.filter((other) => other > value).length;
}

/** Points as entered (for example 8 or 7.5) in twelfths. Not a number gives 0. */
export function pointsToTwelfths(points: number): number {
  if (!Number.isFinite(points)) return 0;
  // `|| 0` turns -0 into 0.
  return Math.round(points * TWELFTHS) || 0;
}

export type TeamResult = { team: string; value: number | null };

export type Placement = {
  team: string;
  /** 1 is first. Teams with the same result share a place: 1, 1, 3, 4. Null without a result. */
  place: number | null;
  /** True when another team has the same place (shown as "gedeeld"). */
  shared: boolean;
  /** Points in twelfths, doubled for the joker. */
  twelfths: number;
  /** True for the team that played its joker on this game. */
  joker: boolean;
};

export type RankOptions = {
  /** Points per place in whole points, first place first. Places beyond the table get 0. */
  table?: readonly number[];
  /** The team that played its joker on this game. */
  joker?: string | null;
};

/**
 * Places and points for one game (§5.2). Teams with the same value share the
 * place and split the points of the places they occupy together: two teams
 * sharing second get (7 + 5) / 2 = 6 each, and the next team is fourth with
 * 3. The joker doubles the shared points. A team without a result (null, or
 * not a finite number) gets no place and 0 points, and comes last.
 *
 * Values are compared exactly, so round them first to what the referee sees
 * (times to hundredths). With more than four teams on one place the share is
 * rounded to the nearest twelfth.
 *
 * The output is sorted by place. Teams on the same place, and teams without
 * a result, keep the order of the input.
 */
export function rankResults(
  results: readonly TeamResult[],
  type: ResultType,
  options: RankOptions = {},
): Placement[] {
  const table = (options.table ?? DEFAULT_PLACE_TABLE).map(pointsToTwelfths);
  const joker = options.joker ?? null;
  const direction = LOWEST_WINS.has(type) ? 1 : -1;
  // Array#sort is stable: equal values keep the input order.
  const ranked = results
    .filter((result): result is { team: string; value: number } => isFiniteNumber(result.value))
    .sort((a, b) => direction * (a.value - b.value));

  const placements: Placement[] = [];
  let start = 0;
  while (start < ranked.length) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].value === ranked[start].value) end += 1;
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += table[index] ?? 0;
    const share = Math.round(sum / (end - start));
    for (let index = start; index < end; index += 1) {
      const team = ranked[index].team;
      const isJoker = team === joker;
      placements.push({
        team,
        place: start + 1,
        shared: end - start > 1,
        twelfths: isJoker ? share * JOKER_FACTOR : share,
        joker: isJoker,
      });
    }
    start = end;
  }
  for (const result of results) {
    if (!isFiniteNumber(result.value)) {
      placements.push({ team: result.team, place: null, shared: false, twelfths: 0, joker: result.team === joker });
    }
  }
  return placements;
}

export type Medal = "goud" | "zilver" | "brons";

/**
 * Gold, silver and bronze for places 1, 2 and 3. Because shared places are
 * numbered 1, 1, 3, this is the Olympic rule of §5.2 by itself: two golds
 * means no silver, and the third team gets bronze.
 */
export function medalForPlace(place: number | null): Medal | null {
  switch (place) {
    case 1:
      return "goud";
    case 2:
      return "zilver";
    case 3:
      return "brons";
    default:
      return null;
  }
}

/** The parts of the weekend (§5.1). */
export type EventKind = "quiz" | "intermezzo" | "vrijdag" | "zeskamp" | "los";

/**
 * One part of the weekend with its points: the quiz, the intermezzo, the
 * friday games, one zeskamp game, or bonus points ("los").
 */
export type ScoreEvent = {
  id: string;
  kind: EventKind;
  /** The quiz, vrijdag and every zeskamp game count for medals; the intermezzo and bonus points do not. */
  countsForMedals: boolean;
  /** Points per team in twelfths, jokers included. A missing team has 0. */
  points: Readonly<Record<string, number>>;
  /**
   * Places per team as `rankResults` gave them (zeskamp games). Medals then
   * follow the places, not the points: a joker can lift third place to the
   * points of first, but third stays bronze. Without places, medals follow
   * the points, highest first (the quiz total with its joker, the friday
   * points).
   */
  places?: Readonly<Record<string, number | null>>;
  /** Teams that played their joker on this event. */
  jokerTeams?: readonly string[];
};

/**
 * The medal of each team for one event (null for none). When medals follow
 * the points, only teams with points take part, so a team whose friday
 * points are not entered yet does not push the others down.
 */
export function eventMedals(event: ScoreEvent, teams: readonly string[]): Record<string, Medal | null> {
  const medals: Record<string, Medal | null> = {};
  for (const team of teams) medals[team] = null;
  if (!event.countsForMedals) return medals;

  const places = event.places;
  if (places) {
    for (const team of teams) {
      const place = own(places, team);
      medals[team] = medalForPlace(isFiniteNumber(place) ? place : null);
    }
    return medals;
  }

  const scored = teams.filter((team) => isFiniteNumber(own(event.points, team)));
  const values = scored.map((team) => event.points[team]);
  for (const team of scored) medals[team] = medalForPlace(placeAmong(event.points[team], values));
  return medals;
}

export type EventScore = {
  eventId: string;
  kind: EventKind;
  /** Points of the team for this event, in twelfths. */
  twelfths: number;
  /** True when the team played its joker on this event. */
  joker: boolean;
};

export type Standing = {
  team: string;
  place: number;
  /** True when another team has the same total (shown as "gedeeld"). */
  shared: boolean;
  /** Total in twelfths. */
  twelfths: number;
  /** Points per event, in the order of the events. */
  breakdown: EventScore[];
};

/**
 * The overall standings (§4.5): per team the sum of all events, highest
 * first. Teams with the same total share the place, without a tiebreak
 * (§5.2); among them the given team order is kept. The result shares no
 * objects with the input, so a snapshot taken at the lock stays as it was.
 */
export function standings(teams: readonly string[], events: readonly ScoreEvent[]): Standing[] {
  const rows = teams.map((team) => {
    const breakdown = events.map((event) => {
      const points = own(event.points, team);
      return {
        eventId: event.id,
        kind: event.kind,
        twelfths: isFiniteNumber(points) ? points : 0,
        joker: event.jokerTeams?.includes(team) ?? false,
      };
    });
    return { team, breakdown, twelfths: breakdown.reduce((sum, score) => sum + score.twelfths, 0) };
  });
  const totals = rows.map((row) => row.twelfths);
  return rows
    .map((row) => ({
      team: row.team,
      place: placeAmong(row.twelfths, totals),
      shared: totals.filter((total) => total === row.twelfths).length > 1,
      twelfths: row.twelfths,
      breakdown: row.breakdown,
    }))
    .sort((a, b) => a.place - b.place);
}

export type MedalRow = {
  team: string;
  gold: number;
  silver: number;
  bronze: number;
  place: number;
  /** True when another team has exactly the same medals. */
  shared: boolean;
};

/**
 * The medal table (§4.5): sorted on gold, then silver, then bronze, as at
 * the Olympic Games. Teams with the same three counts share the place; among
 * them the given team order is kept.
 */
export function medalTable(teams: readonly string[], events: readonly ScoreEvent[]): MedalRow[] {
  const counts = teams.map((team) => ({ team, gold: 0, silver: 0, bronze: 0 }));
  for (const event of events) {
    const medals = eventMedals(event, teams);
    for (const row of counts) {
      const medal = medals[row.team];
      if (medal === "goud") row.gold += 1;
      else if (medal === "zilver") row.silver += 1;
      else if (medal === "brons") row.bronze += 1;
    }
  }
  type Counts = (typeof counts)[number];
  // Positive when `a` has the better medals.
  const compare = (a: Counts, b: Counts) => a.gold - b.gold || a.silver - b.silver || a.bronze - b.bronze;
  return counts
    .map((row) => ({
      ...row,
      place: 1 + counts.filter((other) => compare(other, row) > 0).length,
      shared: counts.filter((other) => compare(other, row) === 0).length > 1,
    }))
    .sort((a, b) => a.place - b.place);
}

/**
 * Twelfths as text (§5.2): a Dutch comma and at most one decimal, without
 * ",0". Halves round away from zero. 1158 → "96,5", 88 (7⅓) → "7,3",
 * 92 (7⅔) → "7,7", 1176 → "98", -24 → "-2". Not a number reads as "0".
 */
export function formatPoints(twelfths: number): string {
  if (!Number.isFinite(twelfths)) return "0";
  // Tenths of a point, rounded half up on the absolute value: |t| × 10 / 12 + ½.
  const tenths = Math.floor((Math.abs(twelfths) * 10 + 6) / TWELFTHS);
  const sign = twelfths < 0 && tenths > 0 ? "-" : "";
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? `${sign}${whole}` : `${sign}${whole},${decimal}`;
}
