import "server-only";
import type postgres from "postgres";
import { formatPoints } from "@/lib/shared/scoring";
import {
  checkResultValue,
  formatResultValue,
  isResultType,
  MODE_LABELS,
  RESULT_TYPE_LABELS,
  roundResultValue,
  type GameMode,
  type GameStatus,
  type ResultType,
} from "@/lib/shared/zeskamp";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { readLiveState } from "./live";
import {
  closeLockIfAuto,
  EVENT_COLUMNS,
  getScoreboard,
  readEvents,
  teamView,
  toEventInfo,
  type EventInfo,
  type TeamView,
} from "./scoreboard";
import { getSettings } from "./settings";
import { isUuid } from "./teams";
import type { Env } from "./tokens";

/**
 * The zeskamp (SPEC §4.9) and the friday games (§4.8): the games and their
 * settings, starting a game (which closes the lock), results from the
 * spelleiders (idempotent, also when sent again from the offline queue),
 * corrections by the admin, the zeskamp joker and the vrijdag points.
 */

type Tx = postgres.TransactionSql;

export type Game = EventInfo & { number: number; total: number };

export async function listGames(env: Env, sql: postgres.Sql | Tx = db()): Promise<Game[]> {
  const games = (await readEvents(env, sql)).filter((event) => event.kind === "zeskamp");
  return games.map((game, index) => ({ ...game, number: index + 1, total: games.length }));
}

/** Per game who last entered its result, and when (SPEC §4.9: who entered what is recorded). */
export async function latestEntries(env: Env): Promise<Record<string, { by: string; at: string }>> {
  const rows = await db()<{ event_id: string; entered_by: string; entered_at: Date }[]>`
    select distinct on (event_id) event_id, entered_by, entered_at
    from valk.event_results where env = ${env}
    order by event_id, entered_at desc
  `;
  return Object.fromEntries(rows.map((row) => [row.event_id, { by: row.entered_by, at: row.entered_at.toISOString() }]));
}

export async function getGame(env: Env, id: string): Promise<Game | null> {
  if (!isUuid(id)) return null;
  return (await listGames(env)).find((game) => game.id === id) ?? null;
}

type TeamRow = { id: string; name: string; color: TeamView["color"] };

async function envTeams(env: Env, sql: postgres.Sql | Tx): Promise<TeamRow[]> {
  return sql<TeamRow[]>`select id, name, color from valk.teams where env = ${env} order by sort, name`;
}

async function lockGame(env: Env, id: string, sql: Tx): Promise<EventInfo | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<Parameters<typeof toEventInfo>[0][]>`
    select ${sql(EVENT_COLUMNS)} from valk.events where env = ${env} and id = ${id} and kind = 'zeskamp' for update
  `;
  return row ? toEventInfo(row) : null;
}

/* ------------------------------------------------------------------------ */
/* Games (admin)                                                             */
/* ------------------------------------------------------------------------ */

export type GameInput = {
  name: string;
  description: string | null;
  sort: number;
  resultType: ResultType;
  unit: string | null;
  mode: GameMode;
  jokerAllowed: boolean;
};

function describeGame(game: Pick<EventInfo, "name" | "description" | "sort" | "resultType" | "unit" | "mode" | "jokerAllowed">) {
  return {
    naam: game.name,
    uitleg: game.description,
    volgorde: game.sort,
    uitslagtype: game.resultType,
    eenheid: game.unit,
    modus: game.mode,
    joker: game.jokerAllowed,
  };
}

export async function addGame(env: Env, input: GameInput, actor: Actor): Promise<string> {
  return db().begin(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into valk.events (env, kind, name, description, sort, result_type, unit, mode, joker_allowed, counts_for_medals)
      values (${env}, 'zeskamp', ${input.name}, ${input.description}, ${input.sort}, ${input.resultType}, ${input.unit},
        ${input.mode}, ${input.jokerAllowed}, true)
      returning id
    `;
    await logAudit(actor, { action: "spel.toegevoegd", entity: "onderdeel", entityId: row.id, newValue: describeGame(input) }, sql, env);
    return row.id;
  });
}

export type UpdateOutcome = "bewaard" | "onbekend" | "type-vast";

export async function updateGame(env: Env, id: string, input: GameInput, actor: Actor): Promise<UpdateOutcome> {
  return db().begin(async (sql) => {
    const before = await lockGame(env, id, sql);
    if (!before) return "onbekend";
    if (before.resultType !== input.resultType) {
      const [has] = await sql`select 1 from valk.event_results where event_id = ${id} limit 1`;
      // The stored values belong to the old type (seconds are no jury marks).
      if (has) return "type-vast";
    }
    await sql`
      update valk.events set
        name = ${input.name}, description = ${input.description}, sort = ${input.sort},
        result_type = ${input.resultType}, unit = ${input.unit}, mode = ${input.mode},
        joker_allowed = ${input.jokerAllowed}, updated_at = now()
      where id = ${id}
    `;
    await logAudit(
      actor,
      { action: "onderdeel.gewijzigd", entity: "onderdeel", entityId: id, oldValue: describeGame(before), newValue: describeGame(input) },
      sql,
      env,
    );
    return "bewaard";
  });
}

export async function deleteGame(env: Env, id: string, actor: Actor): Promise<"verwijderd" | "heeft-uitslag" | "onbekend"> {
  return db().begin(async (sql) => {
    const game = await lockGame(env, id, sql);
    if (!game) return "onbekend";
    const [has] = await sql`select 1 from valk.event_results where event_id = ${id} limit 1`;
    if (has || game.status !== "gepland") return "heeft-uitslag";
    await sql`delete from valk.events where id = ${id}`;
    await logAudit(actor, { action: "spel.verwijderd", entity: "onderdeel", entityId: id, oldValue: describeGame(game) }, sql, env);
    return "verwijderd";
  });
}

/** Place points of the zeskamp for every game (SPEC §5.1: the tables are adjustable). */
export async function setZeskampPointsTable(table: number[], actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<{ zeskamp_points: number[] }[]>`select zeskamp_points from valk.settings where id = 1 for update`;
    if (!row) throw new Error("De instellingen ontbreken in de database.");
    const old = row.zeskamp_points.map(Number);
    if (old.join(",") === table.join(",")) return;
    await sql`
      update valk.settings set zeskamp_points = ${table}::int[], updated_at = now(), updated_by = ${actor.name}
      where id = 1
    `;
    await logAudit(actor, { action: "puntentabellen.gewijzigd", entity: "instellingen", oldValue: { zeskamp: old }, newValue: { zeskamp: table } }, sql);
  });
}

/* ------------------------------------------------------------------------ */
/* Playing a game (spelleiders)                                              */
/* ------------------------------------------------------------------------ */

export type StartOutcome = "gestart" | "al-gestart" | "onbekend";

/**
 * Start a game: status "bezig". The first game that starts closes the lock
 * (when the automatic lock is armed), before anything of the game exists.
 */
export async function startGame(env: Env, id: string, actor: Actor): Promise<StartOutcome> {
  if (!isUuid(id)) return "onbekend";
  return db().begin(async (sql) => {
    const game = await lockGame(env, id, sql);
    if (!game) return "onbekend";
    if (game.status !== "gepland") return "al-gestart";
    await closeLockIfAuto(env, sql, actor, `automatisch bij de start van ${game.name}`);
    await sql`
      update valk.events set status = 'bezig', started_at = now(), started_by = ${actor.name}, updated_at = now()
      where id = ${id}
    `;
    await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = ${env}`;
    await logAudit(actor, { action: "spel.gestart", entity: "onderdeel", entityId: id, newValue: { spel: game.name } }, sql, env);
    return "gestart";
  });
}

export type SubmitInput = { clientId: string; eventId: string; values: { teamId: string; value: number }[] };

export type SubmitOutcome =
  | { status: "ontvangen" | "al-ontvangen" }
  | { status: "conflict" | "ongeldig" | "onbekend"; fout: string };

export function isClientId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/**
 * The result of a game from a spelleider. Idempotent: the same submission
 * (same client id) twice counts once. A different submission for a game
 * that already has a result is refused; the admin corrects instead.
 */
export async function submitResults(env: Env, input: SubmitInput, actor: Actor): Promise<SubmitOutcome> {
  if (!isClientId(input.clientId)) return { status: "ongeldig", fout: "Deze uitslag kwam niet goed aan. Probeer het nog eens." };
  if (!isUuid(input.eventId)) return { status: "onbekend", fout: "Dit spel bestaat niet meer. Kies het spel opnieuw." };
  return db().begin(async (sql): Promise<SubmitOutcome> => {
    const game = await lockGame(env, input.eventId, sql);
    if (!game) return { status: "onbekend", fout: "Dit spel bestaat niet meer. Kies het spel opnieuw." };
    const type = game.resultType;
    if (!isResultType(type)) return { status: "ongeldig", fout: "Dit spel heeft nog geen uitslagtype. Vraag het de beheerder." };

    const existing = await sql<{ client_id: string | null }[]>`select client_id from valk.event_results where event_id = ${game.id}`;
    if (existing.length > 0) {
      if (existing.every((row) => row.client_id === input.clientId)) return { status: "al-ontvangen" };
      return { status: "conflict", fout: "Dit spel heeft al een uitslag. De beheerder kan hem nog corrigeren." };
    }

    const teams = await envTeams(env, sql);
    const values = new Map<string, number>();
    for (const entry of Array.isArray(input.values) ? input.values : []) {
      if (!teams.some((team) => team.id === entry?.teamId) || values.has(entry.teamId)) {
        return { status: "ongeldig", fout: "De teams kloppen niet meer. Ververs de pagina en vul de uitslag opnieuw in." };
      }
      const problem = checkResultValue(type, entry.value, teams.length);
      if (problem) return { status: "ongeldig", fout: problem };
      values.set(entry.teamId, roundResultValue(type, entry.value));
    }
    if (values.size !== teams.length) return { status: "ongeldig", fout: "Vul voor elk team een uitslag in." };

    // The lock first: the snapshot never holds anything of this game.
    await closeLockIfAuto(env, sql, actor, `automatisch bij de uitslag van ${game.name}`);
    for (const team of teams) {
      await sql`
        insert into valk.event_results (env, event_id, team_id, raw_value, entered_by, client_id)
        values (${env}, ${game.id}, ${team.id}, ${values.get(team.id)!}, ${actor.name}, ${input.clientId})
      `;
    }
    await sql`
      update valk.events set
        status = 'klaar', started_at = coalesce(started_at, now()), started_by = coalesce(started_by, ${actor.name}),
        finished_at = now(), updated_at = now()
      where id = ${game.id}
    `;
    await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = ${env}`;
    await logAudit(
      actor,
      {
        action: "uitslag.ingevoerd",
        entity: "onderdeel",
        entityId: game.id,
        newValue: {
          spel: game.name,
          uitslag: Object.fromEntries(teams.map((team) => [team.name, formatResultValue(type, values.get(team.id)!, game.unit)])),
        },
      },
      sql,
      env,
    );
    return { status: "ontvangen" };
  });
}

/**
 * The admin corrects a result (SPEC §4.9 "Corrigeren"): per team a value,
 * or null to clear it. The old values stay in the logbook.
 */
export async function correctResults(
  env: Env,
  id: string,
  values: Record<string, number | null>,
  actor: Actor,
): Promise<{ ok: true; changed: boolean } | { ok: false; fout: string }> {
  return db().begin(async (sql) => {
    const game = await lockGame(env, id, sql);
    if (!game) return { ok: false, fout: "Dit spel bestaat niet meer." };
    const type = game.resultType;
    if (!isResultType(type)) return { ok: false, fout: "Geef het spel eerst een uitslagtype." };
    const teams = await envTeams(env, sql);
    const before = new Map(
      (await sql<{ team_id: string; raw_value: number | null }[]>`
        select team_id, raw_value from valk.event_results where event_id = ${id}
      `).map((row) => [row.team_id, row.raw_value === null ? null : Number(row.raw_value)]),
    );
    const after = new Map<string, number | null>();
    for (const team of teams) {
      const raw = Object.hasOwn(values, team.id) ? values[team.id] : (before.get(team.id) ?? null);
      if (raw === null || raw === undefined) {
        after.set(team.id, null);
        continue;
      }
      const problem = checkResultValue(type, raw, teams.length);
      if (problem) return { ok: false, fout: `${team.name}: ${problem}` };
      after.set(team.id, roundResultValue(type, raw));
    }
    const changed = teams.filter((team) => (before.get(team.id) ?? null) !== (after.get(team.id) ?? null));
    if (changed.length === 0) return { ok: true, changed: false };

    const hadResults = before.size > 0;
    const hasResults = [...after.values()].some((value) => value !== null);
    if (!hadResults && hasResults) await closeLockIfAuto(env, sql, actor, `automatisch bij de uitslag van ${game.name}`);
    for (const team of changed) {
      const value = after.get(team.id) ?? null;
      if (value === null) {
        await sql`delete from valk.event_results where event_id = ${id} and team_id = ${team.id}`;
      } else {
        await sql`
          insert into valk.event_results (env, event_id, team_id, raw_value, entered_by)
          values (${env}, ${id}, ${team.id}, ${value}, ${actor.name})
          on conflict (event_id, team_id) do update set
            raw_value = excluded.raw_value, entered_by = excluded.entered_by, entered_at = now(), client_id = null
        `;
      }
    }
    if (hasResults) {
      await sql`
        update valk.events set status = 'klaar', started_at = coalesce(started_at, now()),
          started_by = coalesce(started_by, ${actor.name}), finished_at = coalesce(finished_at, now()), updated_at = now()
        where id = ${id}
      `;
      await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = ${env}`;
    }
    const text = (value: number | null | undefined) => (value === null || value === undefined ? "geen" : formatResultValue(type, value, game.unit));
    await logAudit(
      actor,
      {
        action: "uitslag.gecorrigeerd",
        entity: "onderdeel",
        entityId: id,
        oldValue: { spel: game.name, uitslag: Object.fromEntries(changed.map((team) => [team.name, text(before.get(team.id))])) },
        newValue: { spel: game.name, uitslag: Object.fromEntries(changed.map((team) => [team.name, text(after.get(team.id))])) },
      },
      sql,
      env,
    );
    return { ok: true, changed: true };
  });
}

/** Back to "gepland": the result is wiped (it stays in the logbook). For a game started by mistake. */
export async function resetGame(env: Env, id: string, actor: Actor): Promise<boolean> {
  return db().begin(async (sql) => {
    const game = await lockGame(env, id, sql);
    if (!game) return false;
    const rows = await sql<{ name: string; raw_value: number | null }[]>`
      delete from valk.event_results r using valk.teams t
      where r.event_id = ${id} and t.id = r.team_id
      returning t.name, r.raw_value
    `;
    await sql`
      update valk.events set status = 'gepland', started_at = null, started_by = null, finished_at = null, updated_at = now()
      where id = ${id}
    `;
    const type = isResultType(game.resultType) ? game.resultType : null;
    await logAudit(
      actor,
      {
        action: "spel.teruggezet",
        entity: "onderdeel",
        entityId: id,
        oldValue: {
          spel: game.name,
          status: game.status,
          uitslag: Object.fromEntries(
            rows.map((row) => [row.name, row.raw_value === null || !type ? "geen" : formatResultValue(type, Number(row.raw_value), game.unit)]),
          ),
        },
      },
      sql,
      env,
    );
    return true;
  });
}

/* ------------------------------------------------------------------------ */
/* The zeskamp joker                                                         */
/* ------------------------------------------------------------------------ */

export type JokerOutcome = { ok: true; melding: string } | { ok: false; fout: string };

/**
 * Put a team's zeskamp joker on a game, move it, or take it back (eventId
 * null). A captain may only do this before both games started: at the start
 * the joker is fixed. The admin may always correct it.
 */
export async function setZeskampJoker(
  env: Env,
  teamId: string,
  eventId: string | null,
  actor: Actor,
  options: { asAdmin: boolean },
): Promise<JokerOutcome> {
  if (!isUuid(teamId) || (eventId !== null && !isUuid(eventId))) return { ok: false, fout: "Dit spel bestaat niet meer." };
  return db().begin(async (sql): Promise<JokerOutcome> => {
    const [team] = await sql<{ name: string }[]>`select name from valk.teams where env = ${env} and id = ${teamId}`;
    if (!team) return { ok: false, fout: "Dit team bestaat niet meer." };
    const [current] = await sql<{ event_id: string | null; name: string | null; status: GameStatus | null }[]>`
      select j.event_id, e.name, e.status
      from valk.jokers j left join valk.events e on e.id = j.event_id
      where j.env = ${env} and j.team_id = ${teamId} and j.kind = 'zeskamp'
      for update of j
    `;
    if (current && current.event_id === eventId) return { ok: true, melding: "De joker stond er al." };
    if (current && !options.asAdmin && current.status && current.status !== "gepland") {
      return { ok: false, fout: `Jullie joker ligt al vast bij ${current.name}.` };
    }

    if (eventId === null) {
      if (!current) return { ok: true, melding: "Er stond geen joker." };
      await sql`delete from valk.jokers where env = ${env} and team_id = ${teamId} and kind = 'zeskamp'`;
      await logAudit(actor, { action: "joker.verwijderd", entity: "joker", oldValue: { team: team.name, spel: current.name } }, sql, env);
      return { ok: true, melding: "De joker is teruggenomen." };
    }

    const game = await lockGame(env, eventId, sql);
    if (!game) return { ok: false, fout: "Dit spel bestaat niet meer." };
    if (!options.asAdmin) {
      if (!game.jokerAllowed) return { ok: false, fout: "Bij dit spel mag geen joker." };
      if (game.status !== "gepland") return { ok: false, fout: `${game.name} is al begonnen. Kies een ander spel.` };
    }
    await sql`
      insert into valk.jokers (env, team_id, kind, event_id, set_by)
      values (${env}, ${teamId}, 'zeskamp', ${eventId}, ${actor.name})
      on conflict (env, team_id, kind) do update set
        event_id = excluded.event_id, round_no = null, set_at = now(), set_by = excluded.set_by
    `;
    await logAudit(
      actor,
      { action: "joker.gezet", entity: "joker", oldValue: current ? { team: team.name, spel: current.name } : undefined, newValue: { team: team.name, spel: game.name } },
      sql,
      env,
    );
    return { ok: true, melding: `De joker staat op ${game.name}.` };
  });
}

/* ------------------------------------------------------------------------ */
/* Vrijdag: free points (SPEC §4.8)                                           */
/* ------------------------------------------------------------------------ */

export async function vrijdagEvent(env: Env, sql: postgres.Sql | Tx = db()): Promise<EventInfo | null> {
  return (await readEvents(env, sql)).find((event) => event.kind === "vrijdag") ?? null;
}

export async function readVrijdagPoints(env: Env): Promise<Record<string, number>> {
  const rows = await db()<{ team_id: string; free_twelfths: number }[]>`
    select r.team_id, r.free_twelfths
    from valk.event_results r join valk.events e on e.id = r.event_id
    where r.env = ${env} and e.kind = 'vrijdag' and r.free_twelfths is not null
  `;
  return Object.fromEntries(rows.map((row) => [row.team_id, Number(row.free_twelfths)]));
}

/** Free points per team in twelfths; null clears a team. */
export async function saveVrijdagPoints(env: Env, points: Record<string, number | null>, actor: Actor): Promise<boolean> {
  return db().begin(async (sql) => {
    let event = await vrijdagEvent(env, sql);
    if (!event) {
      const [row] = await sql<{ id: string }[]>`
        insert into valk.events (env, kind, name, description, sort, result_type, counts_for_medals)
        values (${env}, 'vrijdag', 'Spelletjesmiddag', 'Vrije punten van de beheerder.', 3, 'vrij', true)
        returning id
      `;
      event = (await readEvents(env, sql)).find((e) => e.id === row.id) ?? null;
      if (!event) throw new Error("Het onderdeel vrijdag ontbreekt.");
    }
    await sql`select id from valk.events where id = ${event.id} for update`;
    const teams = await envTeams(env, sql);
    const before = new Map(
      (await sql<{ team_id: string; free_twelfths: number | null }[]>`
        select team_id, free_twelfths from valk.event_results where event_id = ${event.id}
      `).map((row) => [row.team_id, row.free_twelfths === null ? null : Number(row.free_twelfths)]),
    );
    const changed = teams.filter((team) => Object.hasOwn(points, team.id) && (before.get(team.id) ?? null) !== points[team.id]);
    if (changed.length === 0) return false;
    for (const team of changed) {
      const value = points[team.id];
      if (value === null) {
        await sql`delete from valk.event_results where event_id = ${event.id} and team_id = ${team.id}`;
      } else {
        await sql`
          insert into valk.event_results (env, event_id, team_id, free_twelfths, entered_by)
          values (${env}, ${event.id}, ${team.id}, ${value}, ${actor.name})
          on conflict (event_id, team_id) do update set
            free_twelfths = excluded.free_twelfths, entered_by = excluded.entered_by, entered_at = now()
        `;
      }
    }
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from valk.event_results where event_id = ${event.id} and free_twelfths is not null
    `;
    await sql`
      update valk.events set status = ${count > 0 ? "klaar" : "gepland"},
        finished_at = ${count > 0 ? sql`coalesce(finished_at, now())` : null}, updated_at = now()
      where id = ${event.id}
    `;
    if (count > 0) await sql`update valk.live_state set games_started_at = coalesce(games_started_at, now()) where env = ${env}`;
    const text = (value: number | null | undefined) => (value === null || value === undefined ? "geen" : formatPoints(value));
    await logAudit(
      actor,
      {
        action: "vrijdag.punten",
        entity: "onderdeel",
        entityId: event.id,
        oldValue: Object.fromEntries(changed.map((team) => [team.name, text(before.get(team.id))])),
        newValue: Object.fromEntries(changed.map((team) => [team.name, text(points[team.id])])),
      },
      sql,
      env,
    );
    return true;
  });
}

/* ------------------------------------------------------------------------ */
/* What the screens get                                                      */
/* ------------------------------------------------------------------------ */

export type PlacementView = {
  team: TeamView;
  value: number | null;
  valueText: string | null;
  place: number | null;
  shared: boolean;
  twelfths: number;
  joker: boolean;
};

export type ZeskampGameView = {
  id: string;
  number: number;
  total: number;
  name: string;
  description: string | null;
  resultType: ResultType | null;
  resultLabel: string | null;
  unit: string | null;
  mode: GameMode;
  modeLabel: string;
  jokerAllowed: boolean;
  status: GameStatus;
  /** Jokers others may see (fixed at the start), plus the own team's planned joker. */
  jokers: { team: TeamView; own: boolean; fixed: boolean }[];
  /** Places and points, only while the lock is open (or for the admin). */
  results: PlacementView[] | null;
};

export type ZeskampView = {
  locked: boolean;
  games: ZeskampGameView[];
  ownTeam: TeamView | null;
  /** This device may set the team's joker. */
  captain: boolean;
  ownJoker: { gameId: string; gameName: string; fixed: boolean } | null;
};

export type ZeskampViewer = { admin: boolean; ownTeamId: string | null; captain: boolean };

/** The zeskamp for the family (SPEC §4.9): games, their status and the jokers; points only without the lock. */
export async function zeskampViewFor(env: Env, viewer: ZeskampViewer): Promise<ZeskampView> {
  const live = await readLiveState(env);
  const board = await getScoreboard(env, live);
  const events = await readEvents(env);
  const games = events.filter((event) => event.kind === "zeskamp");
  const teams = new Map(board.teams.map((team) => [team.id, team]));
  const showResults = viewer.admin || !live.lockClosed;
  const ownTeam = viewer.ownTeamId ? (teams.get(viewer.ownTeamId) ?? null) : null;
  let ownJoker: ZeskampView["ownJoker"] = null;

  const views = games.map((game, index): ZeskampGameView => {
    const type = isResultType(game.resultType) ? game.resultType : null;
    const fixed = game.status !== "gepland";
    const jokers = board.jokers
      .filter((joker) => joker.kind === "zeskamp" && joker.partId === game.id)
      .flatMap((joker) => {
        const team = teams.get(joker.teamId);
        if (!team) return [];
        const own = joker.teamId === viewer.ownTeamId;
        if (own) ownJoker = { gameId: game.id, gameName: game.name, fixed };
        return fixed || own || viewer.admin ? [{ team: teamView(team), own, fixed }] : [];
      });
    const placements = board.games[game.id];
    return {
      id: game.id,
      number: index + 1,
      total: games.length,
      name: game.name,
      description: game.description,
      resultType: type,
      resultLabel: type ? RESULT_TYPE_LABELS[type] : null,
      unit: game.unit,
      mode: game.mode,
      modeLabel: MODE_LABELS[game.mode],
      jokerAllowed: game.jokerAllowed,
      status: game.status,
      jokers,
      results:
        showResults && placements && type
          ? placements.flatMap((row) => {
              const team = teams.get(row.teamId);
              return team
                ? [
                    {
                      team: teamView(team),
                      value: row.value,
                      valueText: row.value === null ? null : formatResultValue(type, row.value, game.unit),
                      place: row.place,
                      shared: row.shared,
                      twelfths: row.twelfths,
                      joker: row.joker,
                    },
                  ]
                : [];
            })
          : null,
    };
  });

  return {
    locked: live.lockClosed,
    games: views,
    ownTeam: ownTeam ? teamView(ownTeam) : null,
    captain: viewer.captain,
    ownJoker,
  };
}

export type StaffGameView = {
  game: {
    id: string;
    number: number;
    total: number;
    name: string;
    description: string | null;
    resultType: ResultType | null;
    unit: string | null;
    mode: GameMode;
    jokerAllowed: boolean;
    status: GameStatus;
    startedAt: string | null;
    startedBy: string | null;
    finishedAt: string | null;
    pointsTable: number[];
  };
  teams: TeamView[];
  /** Teams with their joker on this game (planned or fixed). */
  jokers: TeamView[];
  /** Who entered the result, when there is one. */
  entered: { by: string; at: string } | null;
  /** The computed places and points: for the admin, without the lock, or for whoever entered it. */
  results: PlacementView[] | null;
  locked: boolean;
};

/** One game for the spelleider screen (SPEC §4.5: spelleiders see the places and points of their own game). */
export async function staffGameView(env: Env, id: string, viewer: { admin: boolean; name: string }): Promise<StaffGameView | null> {
  const game = await getGame(env, id);
  if (!game) return null;
  const live = await readLiveState(env);
  const [board, settings] = await Promise.all([getScoreboard(env, live), getSettings()]);
  const type = isResultType(game.resultType) ? game.resultType : null;
  const rows = await db()<{ entered_by: string; entered_at: Date }[]>`
    select entered_by, entered_at from valk.event_results where event_id = ${game.id} order by entered_at desc limit 1
  `;
  const entered = rows[0] ? { by: rows[0].entered_by, at: rows[0].entered_at.toISOString() } : null;
  const teams = new Map(board.teams.map((team) => [team.id, team]));
  const maySee = viewer.admin || !live.lockClosed || entered?.by === viewer.name;
  const placements = board.games[game.id];
  return {
    game: {
      id: game.id,
      number: game.number,
      total: game.total,
      name: game.name,
      description: game.description,
      resultType: type,
      unit: game.unit,
      mode: game.mode,
      jokerAllowed: game.jokerAllowed,
      status: game.status,
      startedAt: game.startedAt,
      startedBy: game.startedBy,
      finishedAt: game.finishedAt,
      pointsTable: game.pointsTable ?? settings.zeskampPoints,
    },
    teams: board.teams.map(teamView),
    jokers: game.jokerAllowed
      ? board.jokers
          .filter((joker) => joker.kind === "zeskamp" && joker.partId === game.id)
          .flatMap((joker) => {
            const team = teams.get(joker.teamId);
            return team ? [teamView(team)] : [];
          })
      : [],
    entered,
    results:
      maySee && placements && type
        ? placements.flatMap((row) => {
            const team = teams.get(row.teamId);
            return team
              ? [
                  {
                    team: teamView(team),
                    value: row.value,
                    valueText: row.value === null ? null : formatResultValue(type, row.value, game.unit),
                    place: row.place,
                    shared: row.shared,
                    twelfths: row.twelfths,
                    joker: row.joker,
                  },
                ]
              : [];
          })
        : null,
    locked: live.lockClosed,
  };
}
