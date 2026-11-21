import "server-only";
import type postgres from "postgres";
import {
  ceremonyPlan,
  hiddenPlaces,
  nextStepLabel,
  stepIndex,
  type CeremonyStep,
  type CeremonyStepKind,
} from "@/lib/shared/ceremony";
import type { Medal } from "@/lib/shared/scoring";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { lockLiveState, readLiveState } from "./live";
import {
  assembleScoreboard,
  getScoreboard,
  liveView,
  loadScoreboardInput,
  openLock,
  teamView,
  type Scoreboard,
  type TeamView,
  type ViewMedal,
  type ViewStanding,
} from "./scoreboard";
import { readSettings } from "./settings";
import type { Env } from "./tokens";

/**
 * The prize ceremony (SPEC §4.5 "Prijsuitreiking"). The admin starts it and
 * taps through the steps; every phone follows `live_state.ceremony_step`.
 * Each phone only ever receives what has been revealed so far, and the
 * reveal of the winner opens the lock.
 */

export type RevealTeam = { team: TeamView; twelfths: number };
export type RevealGroup = { place: number; shared: boolean; teams: RevealTeam[] };
export type PodiumBlock = { place: number; medal: Medal; teams: RevealTeam[] };

export type CeremonyView = {
  /** The ceremony is on now (live mode "ceremonie"). */
  active: boolean;
  /** It ran to the end and the lock is open: the final screen stays available. */
  finished: boolean;
  step: number;
  current: CeremonyStepKind | null;
  /** Revealed places, from the bottom up. */
  revealed: RevealGroup[];
  /** Places still hidden (for "Nog één plaats te gaan"). */
  hidden: number;
  winners: RevealGroup | null;
  podium: PodiumBlock[] | null;
  final: { standings: ViewStanding[]; medals: ViewMedal[]; medalLeaders: TeamView[] } | null;
  lockClosed: boolean;
  /** Only for the admin: what the next tap does. */
  admin: { next: string; canBack: boolean } | null;
};

function asPool(sql: postgres.TransactionSql): postgres.Sql {
  return sql as unknown as postgres.Sql;
}

function planFor(board: Scoreboard): CeremonyStep[] {
  return ceremonyPlan(board.standings.map((row) => ({ team: row.team.id, place: row.place })));
}

function idle(lockClosed: boolean): CeremonyView {
  return {
    active: false,
    finished: false,
    step: 0,
    current: null,
    revealed: [],
    hidden: 0,
    winners: null,
    podium: null,
    final: null,
    lockClosed,
    admin: null,
  };
}

/** What a phone shows at `step`: never more than the steps so far reveal. */
export function ceremonyView(
  board: Scoreboard,
  step: number,
  state: { active: boolean; finished: boolean; lockClosed: boolean; admin: boolean },
): CeremonyView {
  const plan = planFor(board);
  const at = Math.max(0, Math.min(step, plan.length - 1));
  const rows = new Map(board.standings.map((row) => [row.team.id, row]));
  const reveal = (teams: readonly string[]): RevealTeam[] =>
    teams.flatMap((id) => {
      const row = rows.get(id);
      return row ? [{ team: teamView(row.team), twelfths: row.twelfths }] : [];
    });

  const revealed: RevealGroup[] = plan
    .slice(1, at + 1)
    .flatMap((s) => (s.kind === "plaats" ? [{ place: s.place, shared: s.teams.length > 1, teams: reveal(s.teams) }] : []));

  const winnerAt = stepIndex(plan, "winnaar");
  const winnerStep = plan[winnerAt];
  const winnerTeams = winnerStep?.kind === "winnaar" ? winnerStep.teams : [];
  const showWinner = winnerAt !== -1 && at >= winnerAt;

  const podium: PodiumBlock[] = [];
  if (showWinner) {
    const medals: [number, Medal][] = [
      [1, "goud"],
      [2, "zilver"],
      [3, "brons"],
    ];
    for (const [place, medal] of medals) {
      const teams = board.standings.filter((row) => row.place === place).map((row) => row.team.id);
      if (teams.length > 0) podium.push({ place, medal, teams: reveal(teams) });
    }
  }

  const endAt = stepIndex(plan, "einde");
  let final: CeremonyView["final"] = null;
  if (endAt !== -1 && at >= endAt) {
    const view = liveView(board, { lockClosed: false, lockClosedAt: null }, false);
    final = { standings: view.standings, medals: view.medals, medalLeaders: view.medalLeaders };
  }

  return {
    active: state.active,
    finished: state.finished,
    step: at,
    current: plan[at]?.kind ?? null,
    revealed,
    hidden: hiddenPlaces(plan, at),
    winners: showWinner ? { place: 1, shared: winnerTeams.length > 1, teams: reveal(winnerTeams) } : null,
    podium: showWinner ? podium : null,
    final,
    lockClosed: state.lockClosed,
    admin: state.admin && state.active ? { next: nextStepLabel(plan, at), canBack: at > 0 } : null,
  };
}

export async function ceremonyViewFor(env: Env, admin: boolean): Promise<CeremonyView> {
  const live = await readLiveState(env);
  const active = live.mode === "ceremonie";
  if (!active && (live.lockClosed || live.ceremonyStep === 0)) return idle(live.lockClosed);
  const board = await getScoreboard(env, live);
  const last = planFor(board).length - 1;
  const finished = !active && live.ceremonyStep >= last;
  if (!active && !finished) return idle(live.lockClosed);
  return ceremonyView(board, finished ? last : live.ceremonyStep, { active, finished, lockClosed: live.lockClosed, admin });
}

export type CeremonyAction = "start" | "volgende" | "terug" | "stop";

export type CeremonyOutcome = { ok: true } | { ok: false; fout: string; conflict?: boolean };

function describe(step: CeremonyStep | undefined): string {
  switch (step?.kind) {
    case "intro":
      return "begin";
    case "plaats":
      return `plaats ${step.place} onthuld`;
    case "trom":
      return "tromgeroffel";
    case "winnaar":
      return "winnaar onthuld";
    case "einde":
      return "eindstand";
    default:
      return "onbekend";
  }
}

/**
 * The admin's taps. `expected` is the step the admin's screen showed, so a
 * double tap or a second device never skips a step.
 */
export async function ceremonyAction(env: Env, action: CeremonyAction, actor: Actor, expected: number | null): Promise<CeremonyOutcome> {
  return db().begin(async (sql): Promise<CeremonyOutcome> => {
    const live = await lockLiveState(env, asPool(sql));
    const log = (stap: number, wat: string) =>
      logAudit(actor, { action: "ceremonie.stap", entity: "prijsuitreiking", newValue: { stap, wat } }, sql, env);

    if (action === "start") {
      if (live.mode === "quiz" || live.mode === "intermezzo") {
        return { ok: false, fout: "De quiz of het intermezzo loopt nog. Sluit dat eerst af." };
      }
      if (live.mode === "ceremonie") return { ok: true };
      await sql`update valk.live_state set mode = 'ceremonie', ceremony_step = 0, updated_at = now() where env = ${env}`;
      await log(0, "gestart");
      return { ok: true };
    }

    if (live.mode !== "ceremonie") return { ok: false, fout: "De prijsuitreiking loopt niet meer." };
    if (expected !== null && expected !== live.ceremonyStep) {
      return { ok: false, conflict: true, fout: "Die stap was al gezet. Je ziet nu wat iedereen ziet." };
    }

    if (action === "stop") {
      await sql`update valk.live_state set mode = 'rust', updated_at = now() where env = ${env}`;
      await log(live.ceremonyStep, "gestopt");
      return { ok: true };
    }

    const board = assembleScoreboard(await loadScoreboardInput(env, sql, live, await readSettings()));
    const plan = planFor(board);
    const last = plan.length - 1;

    if (action === "terug") {
      const step = Math.max(0, live.ceremonyStep - 1);
      await sql`update valk.live_state set ceremony_step = ${step}, updated_at = now() where env = ${env}`;
      await log(step, `terug naar ${describe(plan[step])}`);
      return { ok: true };
    }

    if (live.ceremonyStep >= last) {
      await sql`update valk.live_state set mode = 'rust', ceremony_step = ${last}, updated_at = now() where env = ${env}`;
      await log(last, "afgesloten");
      return { ok: true };
    }
    const step = live.ceremonyStep + 1;
    // The reveal of the winner opens the lock (SPEC §5.3).
    if (step >= stepIndex(plan, "winnaar")) await openLock(env, sql, actor, "de onthulling bij de prijsuitreiking");
    await sql`update valk.live_state set ceremony_step = ${step}, updated_at = now() where env = ${env}`;
    await log(step, describe(plan[step]));
    return { ok: true };
  });
}
