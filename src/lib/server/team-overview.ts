import "server-only";
import type { Sql } from "postgres";
import type { JokerState, OwnTeam, TeamsView, TeamView } from "@/lib/shared/home";
import type { RequestContext } from "./context";
import { db } from "./db";
import { listParticipants, type Participant } from "./participants";
import type { Settings } from "./settings";
import { listTeams } from "./teams";
import type { Env } from "./tokens";

/**
 * Teams as the family sees them (SPEC §4.4): members, the captain and
 * whether the jokers are still there. Only once the admin makes the teams
 * visible.
 */

type Jokers = { quiz: JokerState; zeskamp: JokerState };

const UNUSED: JokerState = { used: false, detail: null, over: false };

/** Per team: is the joker for the quiz and for the zeskamp still there? */
export async function jokerStates(env: Env, sql: Sql = db()): Promise<(teamId: string) => Jokers> {
  const [jokers, events] = await Promise.all([
    sql<{ team_id: string; kind: "quiz" | "zeskamp"; round_no: number | null; event_name: string | null }[]>`
      select j.team_id, j.kind, j.round_no, e.name as event_name
      from valk.jokers j left join valk.events e on e.id = j.event_id
      where j.env = ${env}
    `,
    sql<{ kind: "quiz" | "zeskamp"; klaar: boolean }[]>`
      select kind, bool_and(status = 'klaar') as klaar
      from valk.events where env = ${env} and kind in ('quiz', 'zeskamp')
      group by kind
    `,
  ]);
  const over = { quiz: false, zeskamp: false };
  for (const row of events) over[row.kind] = row.klaar;

  const used = new Map<string, Partial<Jokers>>();
  for (const row of jokers) {
    const detail = row.kind === "quiz" ? (row.round_no ? `ronde ${row.round_no}` : null) : row.event_name;
    used.set(row.team_id, { ...used.get(row.team_id), [row.kind]: { used: true, detail, over: false } });
  }
  return (teamId) => ({
    quiz: used.get(teamId)?.quiz ?? { ...UNUSED, over: over.quiz },
    zeskamp: used.get(teamId)?.zeskamp ?? { ...UNUSED, over: over.zeskamp },
  });
}

function captainsByTeam(participants: Participant[]): Map<string, Participant> {
  const captains = new Map<string, Participant>();
  for (const person of participants) {
    if (person.isCaptain && person.teamId && !captains.has(person.teamId)) captains.set(person.teamId, person);
  }
  return captains;
}

/** The team (or teams) of the names on this phone, for the card on Thuis. */
export async function ownTeams(ctx: RequestContext, settings: Settings): Promise<OwnTeam[]> {
  if (!settings.teamsVisible) return [];
  const teamIds = new Set(ctx.names.map((name) => name.teamId).filter((id): id is string => Boolean(id)));
  if (ctx.captainTeam) teamIds.add(ctx.captainTeam.id);
  if (teamIds.size === 0) return [];

  const [teams, participants, jokers] = await Promise.all([listTeams(ctx.env), listParticipants(ctx.env), jokerStates(ctx.env)]);
  const captains = captainsByTeam(participants);
  return teams
    .filter((team) => teamIds.has(team.id))
    .map((team) => {
      const members = ctx.names.filter((name) => name.teamId === team.id);
      const captain = captains.get(team.id) ?? null;
      return {
        id: team.id,
        name: team.name,
        color: team.color,
        members: members.map((name) => name.displayName),
        captain: captain?.displayName ?? null,
        youAreCaptain: ctx.captainTeam?.id === team.id || members.some((name) => name.isCaptain),
        jokers: jokers(team.id),
      };
    });
}

/** All teams with their members, for the team screen. */
export async function teamsView(ctx: RequestContext, settings: Settings): Promise<TeamsView> {
  const familieZiet = settings.teamsVisible && settings.fase2Live;
  const toon = familieZiet || ctx.isAdmin;
  if (!toon) return { toon, familieZiet, teams: [], zonderTeam: 0 };

  const [teams, participants, jokers] = await Promise.all([listTeams(ctx.env), listParticipants(ctx.env), jokerStates(ctx.env)]);
  const mine = new Set(ctx.names.map((name) => name.id));
  const captains = captainsByTeam(participants);
  const known = new Set(teams.map((team) => team.id));
  const view: TeamView[] = teams.map((team) => {
    const members = participants
      .filter((person) => person.teamId === team.id)
      .map((person) => ({ id: person.id, name: person.displayName, captain: person.isCaptain, jij: mine.has(person.id) }))
      .sort((a, b) => Number(b.captain) - Number(a.captain) || a.name.localeCompare(b.name, "nl"));
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      captain: captains.get(team.id)?.displayName ?? null,
      members,
      jokers: jokers(team.id),
      jij: members.some((member) => member.jij) || ctx.captainTeam?.id === team.id,
    };
  });
  const zonderTeam = participants.filter((person) => !person.teamId || !known.has(person.teamId)).length;
  return { toon, familieZiet, teams: view, zonderTeam };
}
