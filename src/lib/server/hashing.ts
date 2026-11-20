import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hmacSha256, type KeyPurpose } from "./keys";

const scrypt = promisify(scryptCallback) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * PINs and the family code are short, so a leaked hash alone must not be
 * enough to guess them: the input is first run through an HMAC with a pepper
 * derived from APP_SECRET, then through scrypt with a random salt.
 *
 * Format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`
 */
const PARAMS = { N: 2 ** 14, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const MAXMEM = 64 * 1024 * 1024;

export async function hashSecret(purpose: KeyPurpose, secret: string): Promise<string> {
  const salt = randomBytes(16);
  const peppered = Buffer.from(await hmacSha256(purpose, secret));
  const hash = await scrypt(peppered, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAXMEM });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join(
    "$",
  );
}

export async function verifySecret(
  purpose: KeyPurpose,
  secret: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return false;
  const expected = Buffer.from(hashText, "base64url");
  const peppered = Buffer.from(await hmacSha256(purpose, secret));
  const actual = await scrypt(peppered, Buffer.from(saltText, "base64url"), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
