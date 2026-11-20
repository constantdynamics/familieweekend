/**
 * Sub-keys derived from the single APP_SECRET with HKDF-SHA256.
 *
 * Uses Web Crypto only, so it works in the proxy as well as in Server
 * Components, Server Actions and Route Handlers. Deliberately no
 * `server-only` import: the proxy imports this module too.
 */

export type KeyPurpose =
  | "session"
  | "staff"
  | "pin-pepper"
  | "code-pepper"
  | "ip-hash"
  | "captain"
  | "proef"
  | "bekijk"
  | "photo";

const encoder = new TextEncoder();
const cache = new Map<string, Promise<Uint8Array>>();

function masterSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_SECRET ontbreekt of is korter dan 32 tekens");
  }
  return secret;
}

async function derive(secret: string, purpose: KeyPurpose): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("valkenburger-spelen-2027"),
      info: encoder.encode(`valk:${purpose}:v1`),
    },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

/** 32 bytes of key material for one purpose, memoised per secret. */
export function subKey(purpose: KeyPurpose): Promise<Uint8Array> {
  const secret = masterSecret();
  const cacheKey = `${purpose}:${secret.length}:${secret.slice(0, 4)}`;
  let key = cache.get(cacheKey);
  if (!key) {
    key = derive(secret, purpose);
    cache.set(cacheKey, key);
  }
  return key;
}

export async function hmacSha256(purpose: KeyPurpose, message: string): Promise<Uint8Array> {
  const raw = await subKey(purpose);
  const key = await crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Random URL-safe token with the given number of random bytes. */
export function randomToken(bytes = 24): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}
