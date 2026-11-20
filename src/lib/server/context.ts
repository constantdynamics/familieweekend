import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { participantsForDevice, getParticipant, type Participant } from "./participants";
import { getFamilySession, getStaffSession, type StaffSession } from "./session";
import { getTeam, teamPinVersion, type Team } from "./teams";
import {
  BEKIJK_COOKIE,
  CAPTAIN_COOKIE,
  PROEF_COOKIE,
  verifyCaptainToken,
  verifyProefToken,
  verifyViewAsToken,
  type Env,
  type ViewAs,
} from "./tokens";

/**
 * Who is asking, worked out once per request: the device, the environment
 * (live or the test environment), staff role, captain role and the names
 * this device chose. "Bekijk als…" only works for the admin in the test
 * environment, so it can never act on real data.
 */
export type RequestContext = {
  deviceId: string | null;
  env: Env;
  staff: StaffSession | null;
  isAdmin: boolean;
  isSpelleider: boolean;
  viewAs: ViewAs | null;
  /** The names that belong to this device (or the person the admin views as). */
  names: Participant[];
  /** This device answers for this team (or the admin views as its captain). */
  captainTeam: Team | null;
  /** This device was captain, but another device took over. */
  captainTakenOver: boolean;
  /** The team of the names on this device, if they share one. */
  ownTeamId: string | null;
};

/**
 * Fresh every call. Server actions use this: they run in the same request as
 * the render that follows, so a cached context would show the state from
 * before the action (for example a name that was just chosen).
 */
export async function getActionContext(): Promise<RequestContext> {
  return resolveRequestContext();
}

/** Once per request, for rendering. */
export const getRequestContext = cache(async (): Promise<RequestContext> => resolveRequestContext());

async function resolveRequestContext(): Promise<RequestContext> {
  const store = await cookies();
  const family = await getFamilySession();
  const deviceId = family?.deviceId ?? null;
  const staff = family ? await getStaffSession() : null;
  const isAdmin = staff?.role === "beheerder";
  const isSpelleider = staff?.role === "spelleider";

  const inTest = family ? await verifyProefToken(store.get(PROEF_COOKIE)?.value, "proef") : false;
  const env: Env = inTest ? "test" : "live";

  const viewAs = isAdmin && env === "test" ? await verifyViewAsToken(store.get(BEKIJK_COOKIE)?.value) : null;

  let names: Participant[] = [];
  let captainTeam: Team | null = null;
  let captainTakenOver = false;

  if (viewAs) {
    const participantId = "participantId" in viewAs ? viewAs.participantId : null;
    const person = participantId ? await getParticipant(env, participantId) : null;
    names = person ? [person] : [];
    if (viewAs.role === "captain") captainTeam = await getTeam(env, viewAs.teamId);
  } else if (deviceId) {
    names = await participantsForDevice(env, deviceId);
    const claims = await verifyCaptainToken(store.get(CAPTAIN_COOKIE)?.value);
    if (claims && claims.env === env && claims.deviceId === deviceId) {
      const current = await teamPinVersion(env, claims.teamId);
      if (current && current.pinVersion === claims.pinVersion) {
        if (current.activeDeviceId === deviceId) captainTeam = await getTeam(env, claims.teamId);
        else captainTakenOver = true;
      }
    }
  }

  const teamIds = new Set(names.map((n) => n.teamId).filter(Boolean));
  let ownTeamId: string | null = teamIds.size === 1 ? [...teamIds][0]! : null;
  if (captainTeam) ownTeamId = captainTeam.id;
  if (viewAs && (viewAs.role === "meekijker" || viewAs.role === "captain")) ownTeamId = viewAs.teamId;

  return {
    deviceId,
    env,
    staff,
    isAdmin,
    isSpelleider,
    viewAs,
    names,
    captainTeam,
    captainTakenOver,
    ownTeamId,
  };
}

/** Roles the app checks before every write. */
export function canActAsCaptain(ctx: RequestContext): boolean {
  return ctx.captainTeam !== null && (ctx.viewAs === null || ctx.viewAs.role === "captain");
}
