/**
 * Signed session tokens (HS256 JWT) for the two cookies:
 *
 * - `valk_sessie`: you entered the family code on this device (120 days,
 *   refreshed while you keep using the app).
 * - `valk_staf`: you logged in with a staff PIN on this device.
 *
 * No `server-only` import: the proxy verifies the family session too.
 */
import { SignJWT, jwtVerify } from "jose";
import { subKey } from "./keys";

export const SESSION_COOKIE = "valk_sessie";
export const STAFF_COOKIE = "valk_staf";
export const DEVICE_COOKIE = "valk_toestel";

export const SESSION_MAX_AGE_S = 120 * 24 * 60 * 60;
export const STAFF_MAX_AGE_S = 30 * 24 * 60 * 60;
export const DEVICE_MAX_AGE_S = 400 * 24 * 60 * 60;
/** Re-issue the family session when it is older than this. */
export const SESSION_REFRESH_AFTER_S = 7 * 24 * 60 * 60;

const ISSUER = "valkenburger-spelen";
const SESSION_AUDIENCE = "valk:familie";
const STAFF_AUDIENCE = "valk:staf";

export type FamilySession = {
  deviceId: string;
  issuedAt: number;
};

export type StaffRole = "beheerder" | "spelleider";

export type StaffClaims = {
  staffId: string;
  role: StaffRole;
  name: string;
  deviceId: string;
  pinVersion: number;
};

export async function createSessionToken(deviceId: string, nowS = nowSeconds()): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(deviceId)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + SESSION_MAX_AGE_S)
    .sign(await subKey("session"));
}

export async function verifySessionToken(token: string | undefined): Promise<FamilySession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await subKey("session"), {
      issuer: ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") return null;
    return { deviceId: payload.sub, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export function sessionNeedsRefresh(session: FamilySession, nowS = nowSeconds()): boolean {
  return nowS - session.issuedAt > SESSION_REFRESH_AFTER_S;
}

export async function createStaffToken(claims: StaffClaims, nowS = nowSeconds()): Promise<string> {
  return new SignJWT({
    role: claims.role,
    name: claims.name,
    dev: claims.deviceId,
    pv: claims.pinVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(STAFF_AUDIENCE)
    .setSubject(claims.staffId)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + STAFF_MAX_AGE_S)
    .sign(await subKey("staff"));
}

export async function verifyStaffToken(token: string | undefined): Promise<StaffClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await subKey("staff"), {
      issuer: ISSUER,
      audience: STAFF_AUDIENCE,
      algorithms: ["HS256"],
    });
    const { sub, role, name, dev, pv } = payload;
    if (typeof sub !== "string" || typeof name !== "string" || typeof dev !== "string") return null;
    if (role !== "beheerder" && role !== "spelleider") return null;
    if (typeof pv !== "number") return null;
    return { staffId: sub, role, name, deviceId: dev, pinVersion: pv };
  } catch {
    return null;
  }
}

/** Public, non-secret id for a device, derived from its device token. */
export async function deviceIdFromToken(deviceToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deviceToken));
  let binary = "";
  for (const byte of new Uint8Array(digest).slice(0, 16)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function cookieBase(maxAgeS: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.VALK_INSECURE_COOKIES !== "1",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeS,
  };
}
