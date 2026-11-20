import "server-only";
import { drawChallenger, drawFirstPair, duelOutcome, isRpsChoice, markPlayed, streaks, type RpsChoice } from "@/lib/shared/rps";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { readLiveState, ring } from "./live";
import { readSettings } from "./settings";
import type { Env } from "./tokens";

/**
 * Intermezzo: steen, papier, schaar (SPEC §4.7). The quizmaster starts it;
 * the app draws two players from different teams. They choose in secret on
 * their own phone; when both have chosen, all phones count down 3, 2, 1 and
 * then reveal. A draw means choosing again. The winner stays; the next
 * challenger comes from another team, and nobody plays twice before
 * everyone has played.
 */

/** The countdown before the reveal, in milliseconds. */
export const REVEAL_DELAY_MS = 3500;
/** After a draw, the phones show "Gelijkspel!" this long before choosing again. */
const TIE_PAUSE_MS = 2500;

type DuelRow = {
  id: string;
  seq: number;
  champion_id: string;
  challenger_id: string;
  champion_choice: RpsChoice | null;
  challenger_choice: RpsChoice | null;
  winner_id: string | null;
  status: "kiezen" | "onthullen" | "klaar" | "gestopt";
  in_real_life: boolean;
  reveal_at: Date | null;
};

type Player = { id: string; name: string; team: string; teamName: string; teamColor: string };

async function players(env: Env): Promise<Player[]> {
  return db()<Player[]>`
    select p.id, coalesce(nullif(trim(p.nickname), ''), p.name) as name, t.id as team, t.name as "teamName", t.color as "teamColor"
    from valk.participants p join valk.teams t on t.id = p.team_id
    where p.env = ${env}
    order by lower(p.name)
  `;
}

async function duels(env: Env): Promise<DuelRow[]> {
  return db()<DuelRow[]>`select * from valk.duels where env = ${env} order by seq`;
}

/** Who has played in this round of "everyone once", from all duels so far. */
function playedSet(all: Player[], rows: DuelRow[]): Set<string> {
  let played = new Set<string>();
  for (const row of rows) {
    if (row.status === "gestopt" && !row.winner_id) continue;
    played = markPlayed(all, played, [row.champion_id, row.challenger_id]);
  }
  return played;
}

/**
 * A finished draw becomes a fresh choice again. Lazy: whoever asks first
 * after the pause moves it on, and everyone gets a ring.
 */
async function settleTie(env: Env, row: DuelRow): Promise<boolean> {
  if (row.status !== "onthullen" || !row.reveal_at) return false;
  if (Date.now() < row.reveal_at.getTime() + TIE_PAUSE_MS) return false;
  const updated = await db()`
    update valk.duels set champion_choice = null, challenger_choice = null, status = 'kiezen', reveal_at = null
    where id = ${row.id} and status = 'onthullen'
    returning id
  `;
  if (updated.length > 0) await ring(env);
  return updated.length > 0;
}

export type DuelView = {
  id: string;
  seq: number;
  champion: Player;
  challenger: Player;
  status: "kiezen" | "aftellen" | "gelijk" | "klaar" | "gestopt";
  inRealLife: boolean;
  championChose: boolean;
  challengerChose: boolean;
  /** Only after the reveal moment. */
  championChoice: RpsChoice | null;
  challengerChoice: RpsChoice | null;
  winnerId: string | null;
  revealAt: string | null;
};

export type IntermezzoView = {
  active: boolean;
  serverNow: string;
  duel: DuelView | null;
  /** The ids on this phone that must choose now. */
  mustChoose: { id: string; name: string }[];
  /** Wins per team in this intermezzo (1 duel = settings.intermezzoPoints). */
  wins: { team: string; name: string; color: string; wins: number }[];
  current: { name: string; count: number } | null;
  longest: { name: string; count: number } | null;
  duelCount: number;
  maxDuels: number | null;
  /** All names, for the quick name roll when a new duel is drawn. */
  names: string[];
};

function toView(row: DuelRow, byId: Map<string, Player>, now: number): DuelView | null {
  const champion = byId.get(row.champion_id);
  const challenger = byId.get(row.challenger_id);
  if (!champion || !challenger) return null;
  // Choices exist on the server from the first pick, but phones only see them
  // after the reveal moment. Played for real: no choices, the winner at once.
  const revealed = row.reveal_at !== null && now >= row.reveal_at.getTime();
  let status: DuelView["status"] = row.status === "onthullen" ? "gelijk" : row.status;
  if ((row.status === "onthullen" || row.status === "klaar") && !row.in_real_life && !revealed) status = "aftellen";
  const showChoices = revealed && !row.in_real_life;
  const showWinner = row.in_real_life ? row.status === "klaar" : revealed;
  return {
    id: row.id,
    seq: row.seq,
    champion,
    challenger,
    status,
    inRealLife: row.in_real_life,
    championChose: row.champion_choice !== null,
    challengerChose: row.challenger_choice !== null,
    championChoice: showChoices ? row.champion_choice : null,
    challengerChoice: showChoices ? row.challenger_choice : null,
    winnerId: showWinner ? row.winner_id : null,
    revealAt: row.reveal_at?.toISOString() ?? null,
  };
}

/** What this phone may see right now. Choices stay secret until the reveal. */
export async function intermezzoView(env: Env, deviceNames: string[]): Promise<IntermezzoView> {
  const [live, all, settings] = await Promise.all([readLiveState(env), players(env), readSettings()]);
  let rows = await duels(env);
  const last = rows.at(-1);
  if (last && (await settleTie(env, last))) rows = await duels(env);
  const now = Date.now();
  const byId = new Map(all.map((p) => [p.id, p]));
  const current = rows.at(-1);
  const duel = current && current.status !== "gestopt" ? toView(current, byId, now) : null;

  const finished = rows.filter((r) => r.status === "klaar" && r.winner_id && (!r.reveal_at || now >= r.reveal_at.getTime()));
  const winsByTeam = new Map<string, number>();
  for (const row of finished) {
    const team = byId.get(row.winner_id!)?.team;
    if (team) winsByTeam.set(team, (winsByTeam.get(team) ?? 0) + 1);
  }
  const teams = new Map<string, { name: string; color: string }>();
  for (const p of all) teams.set(p.team, { name: p.teamName, color: p.teamColor });
  const run = streaks(finished.map((r) => r.winner_id!));

  const mustChoose: { id: string; name: string }[] = [];
  if (current && current.status === "kiezen" && !current.in_real_life && live.mode === "intermezzo") {
    if (deviceNames.includes(current.champion_id) && !current.champion_choice) {
      mustChoose.push({ id: current.champion_id, name: byId.get(current.champion_id)?.name ?? "" });
    }
    if (deviceNames.includes(current.challenger_id) && !current.challenger_choice) {
      mustChoose.push({ id: current.challenger_id, name: byId.get(current.challenger_id)?.name ?? "" });
    }
  }

  return {
    active: live.mode === "intermezzo",
    serverNow: new Date(now).toISOString(),
    duel,
    mustChoose,
    wins: [...teams.entries()].map(([team, t]) => ({ team, name: t.name, color: t.color, wins: winsByTeam.get(team) ?? 0 })),
    current: run.current ? { name: byId.get(run.current.player)?.name ?? "", count: run.current.count } : null,
    longest: run.longest ? { name: byId.get(run.longest.player)?.name ?? "", count: run.longest.count } : null,
    duelCount: finished.length,
    maxDuels: settings.intermezzoMaxDuels,
    names: all.map((p) => p.name),
  };
}

export type IntermezzoResult = { ok: true } | { fout: string };

async function nextSeq(env: Env): Promise<number> {
  const [row] = await db()<{ seq: number }[]>`select coalesce(max(seq), 0)::int + 1 as seq from valk.duels where env = ${env}`;
  return row.seq;
}

/** The quizmaster draws the first pair, or the next challenger for the winner. */
export async function drawNext(env: Env, actor: Actor): Promise<IntermezzoResult> {
  const live = await readLiveState(env);
  if (live.mode !== "intermezzo") return { fout: "Start eerst het intermezzo." };
  const [all, rows, settings] = await Promise.all([players(env), duels(env), readSettings()]);
  const last = rows.at(-1);
  if (last && (last.status === "kiezen" || last.status === "onthullen")) {
    return { fout: "Er loopt nog een duel. Maak dat eerst af." };
  }
  const finished = rows.filter((r) => r.status === "klaar").length;
  if (settings.intermezzoMaxDuels !== null && finished >= settings.intermezzoMaxDuels) {
    return { fout: `Het ingestelde aantal van ${settings.intermezzoMaxDuels} duels is gespeeld.` };
  }
  const played = playedSet(all, rows);
  const champion = last && last.status === "klaar" ? last.winner_id : null;
  let pair: [string, string] | null = null;
  if (champion && all.some((p) => p.id === champion)) {
    const challenger = drawChallenger(all, champion, played, Math.random);
    if (challenger) pair = [champion, challenger.id];
  } else {
    // Prefer players who have not played yet; fall back to everyone.
    const first = drawFirstPair(all.filter((p) => !played.has(p.id)), Math.random) ?? drawFirstPair(all, Math.random);
    if (first) pair = [first[0].id, first[1].id];
  }
  if (!pair) return { fout: "Er zijn niet genoeg spelers uit verschillende teams." };
  await db().begin(async (sql) => {
    await sql`
      insert into valk.duels (env, seq, champion_id, challenger_id)
      values (${env}, ${await nextSeq(env)}, ${pair![0]}, ${pair![1]})
    `;
    await logAudit(actor, { action: "intermezzo.stap", entity: "duel", newValue: { stap: "geloot" } }, sql, env);
  });
  await ring(env);
  return { ok: true };
}

/** A drawn player chooses in secret, on their own phone. */
export async function choose(env: Env, participantId: string, choice: unknown, deviceNames: string[]): Promise<IntermezzoResult> {
  if (!isRpsChoice(choice)) return { fout: "Kies steen, papier of schaar." };
  if (!deviceNames.includes(participantId)) return { fout: "Dit is niet jouw duel." };
  const live = await readLiveState(env);
  if (live.mode !== "intermezzo") return { fout: "Het intermezzo is voorbij." };
  const result = await db().begin(async (sql) => {
    const [row] = await sql<DuelRow[]>`
      select * from valk.duels where env = ${env} order by seq desc limit 1 for update
    `;
    if (!row || row.status !== "kiezen" || row.in_real_life) return { fout: "Er valt nu niets te kiezen." } as const;
    const isChampion = row.champion_id === participantId;
    const isChallenger = row.challenger_id === participantId;
    if (!isChampion && !isChallenger) return { fout: "Dit is niet jouw duel." } as const;
    const championChoice = isChampion ? choice : row.champion_choice;
    const challengerChoice = isChallenger ? choice : row.challenger_choice;
    if (championChoice && challengerChoice) {
      const outcome = duelOutcome(championChoice, challengerChoice);
      const winner = outcome === "a" ? row.champion_id : outcome === "b" ? row.challenger_id : null;
      await sql`
        update valk.duels set
          champion_choice = ${championChoice}, challenger_choice = ${challengerChoice},
          winner_id = ${winner}, status = ${winner ? "klaar" : "onthullen"},
          reveal_at = now() + ${`${REVEAL_DELAY_MS} milliseconds`}::interval,
          decided_at = ${winner ? sql`now()` : null}
        where id = ${row.id}
      `;
    } else {
      await sql`
        update valk.duels set champion_choice = ${championChoice}, challenger_choice = ${challengerChoice}
        where id = ${row.id}
      `;
    }
    return { ok: true } as const;
  });
  if ("ok" in result) await ring(env);
  return result;
}

/** Without phones (a child, say): the quizmaster plays it for real and taps the winner. */
export async function playInRealLife(env: Env, actor: Actor): Promise<IntermezzoResult> {
  const updated = await db()`
    update valk.duels set in_real_life = true, champion_choice = null, challenger_choice = null, status = 'kiezen', reveal_at = null
    where id = (select id from valk.duels where env = ${env} order by seq desc limit 1) and status in ('kiezen', 'onthullen')
    returning id
  `;
  if (updated.length === 0) return { fout: "Er loopt geen duel." };
  await logAudit(actor, { action: "intermezzo.stap", entity: "duel", newValue: { stap: "in het echt" } }, db(), env);
  await ring(env);
  return { ok: true };
}

export async function chooseWinnerInRealLife(env: Env, winnerId: string, actor: Actor): Promise<IntermezzoResult> {
  const updated = await db()`
    update valk.duels set winner_id = ${winnerId}, status = 'klaar', decided_at = now(), reveal_at = null
    where id = (select id from valk.duels where env = ${env} order by seq desc limit 1)
      and in_real_life and status = 'kiezen' and ${winnerId} in (champion_id, challenger_id)
    returning id
  `;
  if (updated.length === 0) return { fout: "Dat kan nu niet." };
  await logAudit(actor, { action: "intermezzo.stap", entity: "duel", newValue: { stap: "winnaar aangetikt" } }, db(), env);
  await ring(env);
  return { ok: true };
}

/** Draw someone else for the current duel (for example when a player is not there). */
export async function redraw(env: Env, actor: Actor): Promise<IntermezzoResult> {
  const rows = await duels(env);
  const last = rows.at(-1);
  if (!last || last.status !== "kiezen") return { fout: "Er loopt geen duel om opnieuw te loten." };
  await db()`update valk.duels set status = 'gestopt' where id = ${last.id}`;
  await logAudit(actor, { action: "intermezzo.stap", entity: "duel", newValue: { stap: "opnieuw geloot" } }, db(), env);
  return drawNext(env, actor);
}

/** End the intermezzo: an unfinished duel is stopped. */
export async function stopIntermezzo(env: Env, actor: Actor): Promise<void> {
  await db()`
    update valk.duels set status = 'gestopt'
    where env = ${env} and status in ('kiezen', 'onthullen')
  `;
  await logAudit(actor, { action: "intermezzo.stap", entity: "duel", newValue: { stap: "gestopt" } }, db(), env);
  await ring(env);
}
