import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { randomToken } from "./keys";
import {
  DEVICE_COOKIE,
  DEVICE_MAX_AGE_S,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  STAFF_COOKIE,
  STAFF_MAX_AGE_S,
  cookieBase,
  createSessionToken,
  createStaffToken,
  deviceIdFromToken,
  verifySessionToken,
  verifyStaffToken,
  type FamilySession,
  type StaffRole,
} from "./tokens";

export async function getFamilySession(): Promise<FamilySession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireFamilySession(): Promise<FamilySession> {
  const session = await getFamilySession();
  if (!session) redirect("/welkom");
  return session;
}

/**
 * Called after a correct family code. Keeps the long-lived device token when
 * there is one, so this phone stays the same phone for the app.
 */
export async function startFamilySession(): Promise<FamilySession> {
  const store = await cookies();
  let deviceToken = store.get(DEVICE_COOKIE)?.value;
  if (!deviceToken || deviceToken.length < 20) deviceToken = randomToken(24);
  const deviceId = await deviceIdFromToken(deviceToken);
  store.set(DEVICE_COOKIE, deviceToken, cookieBase(DEVICE_MAX_AGE_S));
  store.set(SESSION_COOKIE, await createSessionToken(deviceId), cookieBase(SESSION_MAX_AGE_S));
  return { deviceId, issuedAt: Math.floor(Date.now() / 1000) };
}

export type StaffSession = {
  staffId: string;
  role: StaffRole;
  name: string;
  deviceId: string;
};

/**
 * The logged-in staff member on this device, checked against the database:
 * the account must still be active and the PIN unchanged since login.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const claims = await verifyStaffToken(store.get(STAFF_COOKIE)?.value);
  if (!claims) return null;
  const family = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!family || family.deviceId !== claims.deviceId) return null;
  const [row] = await db()<{ name: string; role: StaffRole; pin_version: number; active: boolean }[]>`
    select name, role, pin_version, active from valk.staff where id = ${claims.staffId}
  `;
  if (!row || !row.active || row.role !== claims.role || row.pin_version !== claims.pinVersion) {
    return null;
  }
  return { staffId: claims.staffId, role: row.role, name: row.name, deviceId: claims.deviceId };
}

export async function requireAdmin(): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "beheerder") redirect("/beheer");
  return staff;
}

export async function startStaffSession(input: {
  staffId: string;
  role: StaffRole;
  name: string;
  deviceId: string;
  pinVersion: number;
}): Promise<void> {
  const store = await cookies();
  store.set(STAFF_COOKIE, await createStaffToken(input), cookieBase(STAFF_MAX_AGE_S));
}

export async function endStaffSession(): Promise<void> {
  const store = await cookies();
  store.delete(STAFF_COOKIE);
}

/** Spelleider or beheerder: the zeskamp screens, the game helper and the checklist. */
export async function requireStaff(): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff) redirect("/spelleider");
  return staff;
}
