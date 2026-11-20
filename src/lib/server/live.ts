import "server-only";
import { after } from "next/server";
import type { Sql } from "postgres";
import { db } from "./db";
import { logError } from "./log";
import { readSettings } from "./settings";
import type { Env } from "./tokens";

/**
 * "Deurbel en brievenbus" (SPEC §7.2). The database is the truth. After every
 * write the server raises the version of the environment and rings a public
 * Realtime channel with nothing but that number. Phones then fetch the state
 * through the role-aware API. A forged ring only causes an extra fetch.
 */

export type LiveMode = "rust" | "quiz" | "intermezzo" | "ceremonie";
export type QuizPhase = "rondescherm" | "open" | "gesloten" | "onthuld" | "tussenstand" | "einde";

export type LiveState = {
  env: Env;
  mode: LiveMode;
  quizId: string | null;
  roundNo: number | null;
  questionId: string | null;
  phase: QuizPhase | null;
  listening: boolean;
  countdownUntil: string | null;
  ceremonyStep: number;
  lockClosed: boolean;
  lockClosedAt: string | null;
  lockAuto: boolean;
  gamesStartedAt: string | null;
  version: number;
};

type Row = {
  env: Env;
  mode: LiveMode;
  quiz_id: string | null;
  round_no: number | null;
  question_id: string | null;
  phase: QuizPhase | null;
  listening: boolean;
  countdown_until: Date | null;
  ceremony_step: number;
  lock_closed: boolean;
  lock_closed_at: Date | null;
  lock_auto: boolean;
  games_started_at: Date | null;
  version: string;
};

function toState(row: Row): LiveState {
  return {
    env: row.env,
    mode: row.mode,
    quizId: row.quiz_id,
    roundNo: row.round_no,
    questionId: row.question_id,
    phase: row.phase,
    listening: row.listening,
    countdownUntil: row.countdown_until?.toISOString() ?? null,
    ceremonyStep: row.ceremony_step,
    lockClosed: row.lock_closed,
    lockClosedAt: row.lock_closed_at?.toISOString() ?? null,
    lockAuto: row.lock_auto,
    gamesStartedAt: row.games_started_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

export async function readLiveState(env: Env, sql: Sql = db()): Promise<LiveState> {
  const [row] = await sql<Row[]>`select * from valk.live_state where env = ${env}`;
  if (!row) throw new Error(`live_state ontbreekt voor ${env}. Draai de migraties.`);
  return toState(row);
}

/** Lock the row for an update inside a transaction. */
export async function lockLiveState(env: Env, sql: Sql): Promise<LiveState> {
  const [row] = await sql<Row[]>`select * from valk.live_state where env = ${env} for update`;
  if (!row) throw new Error(`live_state ontbreekt voor ${env}.`);
  return toState(row);
}

export async function readVersion(env: Env): Promise<number> {
  const [row] = await db()<{ version: string }[]>`select version from valk.live_state where env = ${env}`;
  return Number(row?.version ?? 0);
}

/**
 * Raise the version and ring the doorbell. Call it after the transaction
 * that changed something has committed.
 */
export async function ring(env: Env): Promise<number> {
  const [row] = await db()<{ version: string }[]>`
    update valk.live_state set version = version + 1, updated_at = now()
    where env = ${env}
    returning version
  `;
  const version = Number(row?.version ?? 0);
  try {
    after(() => broadcast(env, version));
  } catch {
    // Outside a request (scripts, tests): ring right away.
    await broadcast(env, version);
  }
  return version;
}

export function channelName(env: Env): string {
  return `valk-${env}`;
}

async function broadcast(env: Env, version: number): Promise<void> {
  try {
    const { realtime } = await readSettings();
    if (!realtime) return;
    const response = await fetch(`${realtime.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: realtime.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: channelName(env), event: "seintje", payload: { v: version }, private: false }],
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) logError("live.seintje", new Error(`Realtime gaf ${response.status}`));
  } catch (error) {
    logError("live.seintje", error);
  }
}
