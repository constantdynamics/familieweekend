import "server-only";
import type { TransactionSql } from "postgres";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { seedTestFunfacts } from "./funfacts";
import { hashSecret } from "./hashing";
import { generatePin } from "./pins";
import { seedDemoQuiz } from "./quiz/demo";
import { seedSampleScores } from "./scoreboard";

/**
 * The test environment (SPEC §3 "Testmodus"): own teams, PINs, names and
 * scores, so trying things out never touches the real Spelen. Emptied with
 * one button.
 */

const PROEFTEAMS = [
  { name: "Proefteam Oranje", color: "oranje", sort: 1, leden: ["Anna Proef", "Bram Proef", "Cas Proef"] },
  { name: "Proefteam Mosterd", color: "mosterd", sort: 2, leden: ["Daan Proef", "Eva Proef", "Fien Proef"] },
  { name: "Proefteam Avocado", color: "avocado", sort: 3, leden: ["Gijs Proef", "Hanna Proef", "Ivo Proef"] },
  { name: "Proefteam Petrol", color: "petrol", sort: 4, leden: ["Jet Proef", "Kees Proef", "Lot Proef"] },
] as const;

export type ProefPin = { team: string; pin: string };

type Sql = TransactionSql;

/**
 * Extra steps for "Zet de proef klaar" (the demo quiz, sample results…).
 * Features add their function to this list. Each runs inside the same
 * transaction, after the test teams and names exist.
 */
type Stap = (sql: Sql) => Promise<void>;
const STAPPEN: Stap[] = [seedTestFunfacts, seedDemoQuiz, seedSampleScores];

/** Fresh test teams with new PINs (returned once), test names and a copy of the events. */
export async function setUpTestEnvironment(actor: Actor): Promise<ProefPin[]> {
  const pins: ProefPin[] = PROEFTEAMS.map((t) => ({ team: t.name, pin: generatePin() }));
  const hashes = await Promise.all(pins.map((p) => hashSecret("pin-pepper", p.pin)));
  await db().begin(async (sql) => {
    await clearTestData(sql);
    for (const [index, team] of PROEFTEAMS.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into valk.teams (env, name, color, sort, pin_hash)
        values ('test', ${team.name}, ${team.color}, ${team.sort}, ${hashes[index]})
        returning id
      `;
      for (const [position, name] of team.leden.entries()) {
        await sql`
          insert into valk.participants (env, name, team_id, is_captain, is_child)
          values ('test', ${name}, ${row.id}, ${position === 0}, ${position === 2})
        `;
      }
    }
    await sql`
      insert into valk.events (env, kind, name, description, sort, result_type, unit, mode, points_table, joker_allowed, counts_for_medals)
      select 'test', kind, name, description, sort, result_type, unit, mode, points_table, joker_allowed, counts_for_medals
      from valk.events where env = 'live'
    `;
    for (const stap of STAPPEN) await stap(sql);
    await sql`update valk.live_state set version = version + 1, updated_at = now() where env = 'test'`;
    await logAudit(actor, { action: "proef.klaargezet", entity: "proef" }, sql, "test");
  });
  return pins;
}

/** Remove everything in the test environment. The real Spelen stay untouched. */
export async function emptyTestEnvironment(actor: Actor): Promise<void> {
  await db().begin(async (sql) => {
    await clearTestData(sql);
    await sql`update valk.live_state set version = version + 1, updated_at = now() where env = 'test'`;
    await logAudit(actor, { action: "proef.leeggemaakt", entity: "proef" }, sql, "test");
  });
}

async function clearTestData(sql: Sql) {
  await sql`
    update valk.live_state set
      mode = 'rust', quiz_id = null, round_no = null, question_id = null, phase = null, listening = false,
      countdown_until = null, ceremony_step = 0, lock_closed = false, lock_closed_at = null, lock_auto = true,
      games_started_at = null
    where env = 'test'
  `;
  await sql`delete from valk.quiz_answers where env = 'test'`;
  await sql`delete from valk.duels where env = 'test'`;
  await sql`delete from valk.scoreboard_snapshots where env = 'test'`;
  await sql`delete from valk.bonus_points where env = 'test'`;
  await sql`delete from valk.jokers where env = 'test'`;
  await sql`delete from valk.event_results where env = 'test'`;
  await sql`delete from valk.events where env = 'test'`;
  await sql`delete from valk.participants where env = 'test'`;
  await sql`delete from valk.teams where env = 'test'`;
  await sql`delete from valk.audit_log where env = 'test'`;
}

export async function testEnvironmentSummary(): Promise<{ teams: number; names: number; events: number }> {
  const [row] = await db()<{ teams: number; names: number; events: number }[]>`
    select
      (select count(*)::int from valk.teams where env = 'test') as teams,
      (select count(*)::int from valk.participants where env = 'test') as names,
      (select count(*)::int from valk.events where env = 'test') as events
  `;
  return row ?? { teams: 0, names: 0, events: 0 };
}

/**
 * "Alles opruimen" after the weekend (SPEC §4.11, §8): fun facts, their
 * photos (and AI versions) and the name links go. The board stays: the
 * owner wants the memories for next year.
 */
export async function cleanUpAfterWeekend(actor: Actor): Promise<{ answers: number; photos: number; links: number }> {
  return db().begin(async (sql) => {
    const answers = await sql`delete from valk.funfact_answers returning participant_id`;
    const photos = await sql`delete from valk.uploads where kind in ('funfact', 'ai') returning id`;
    const links = await sql`
      update valk.participants set claimed_device_id = null, claimed_at = null, funfacts_done_at = null, updated_at = now()
      where claimed_device_id is not null or funfacts_done_at is not null
      returning id
    `;
    const result = { answers: answers.length, photos: photos.length, links: links.length };
    await logAudit(actor, { action: "alles.opgeruimd", entity: "privacy", newValue: result }, sql);
    return result;
  });
}
