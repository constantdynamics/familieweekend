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

/* ------------------------------------------------------------------------ */
/* Roles on a device beyond the family session.                              */
/* ------------------------------------------------------------------------ */

export const CAPTAIN_COOKIE = "valk_captain";
export const PROEF_COOKIE = "valk_proef";
export const BEKIJK_COOKIE = "valk_bekijk";

export const CAPTAIN_MAX_AGE_S = 30 * 24 * 60 * 60;
/** A device stays in the test environment for at most a day. */
export const PROEF_MAX_AGE_S = 24 * 60 * 60;

export type Env = "live" | "test";

export type CaptainClaims = {
  teamId: string;
  env: Env;
  pinVersion: number;
  deviceId: string;
};

export async function createCaptainToken(claims: CaptainClaims, nowS = nowSeconds()): Promise<string> {
  return new SignJWT({ env: claims.env, pv: claims.pinVersion, dev: claims.deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("valk:captain")
    .setSubject(claims.teamId)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + CAPTAIN_MAX_AGE_S)
    .sign(await subKey("captain"));
}

export async function verifyCaptainToken(token: string | undefined): Promise<CaptainClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await subKey("captain"), {
      issuer: ISSUER,
      audience: "valk:captain",
      algorithms: ["HS256"],
    });
    const { sub, env, pv, dev } = payload;
    if (typeof sub !== "string" || typeof dev !== "string" || typeof pv !== "number") return null;
    if (env !== "live" && env !== "test") return null;
    return { teamId: sub, env, pinVersion: pv, deviceId: dev };
  } catch {
    return null;
  }
}

/**
 * The test environment: on this device ("proef") or as an invitation link
 * for another device ("uitnodiging"). Both expire within a day.
 */
export async function createProefToken(kind: "proef" | "uitnodiging", nowS = nowSeconds()): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(`valk:${kind}`)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + PROEF_MAX_AGE_S)
    .sign(await subKey("proef"));
}

export async function verifyProefToken(token: string | undefined, kind: "proef" | "uitnodiging"): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, await subKey("proef"), {
      issuer: ISSUER,
      audience: `valk:${kind}`,
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

/** "Bekijk als…": the admin looks at the test environment through someone else's eyes. */
export type ViewAs =
  | { role: "familie"; participantId: string | null }
  | { role: "captain"; teamId: string }
  | { role: "meekijker"; teamId: string; participantId: string | null }
  | { role: "spelleider" };

export async function createViewAsToken(view: ViewAs, nowS = nowSeconds()): Promise<string> {
  return new SignJWT({ view })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("valk:bekijk")
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + PROEF_MAX_AGE_S)
    .sign(await subKey("bekijk"));
}

export async function verifyViewAsToken(token: string | undefined): Promise<ViewAs | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await subKey("bekijk"), {
      issuer: ISSUER,
      audience: "valk:bekijk",
      algorithms: ["HS256"],
    });
    const view = payload.view as ViewAs | undefined;
    if (!view || typeof view !== "object") return null;
    if (view.role === "captain" && typeof view.teamId === "string") return view;
    if (view.role === "meekijker" && typeof view.teamId === "string") return view;
    if (view.role === "familie") return view;
    if (view.role === "spelleider") return view;
    return null;
  } catch {
    return null;
  }
}
