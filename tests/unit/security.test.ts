import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "@/lib/server/hashing";
import {
  createSessionToken,
  createStaffToken,
  deviceIdFromToken,
  sessionNeedsRefresh,
  verifySessionToken,
  verifyStaffToken,
} from "@/lib/server/tokens";

describe("hashes voor PIN en familiecode", () => {
  it("klopt alleen met de juiste waarde en het juiste doel", async () => {
    const hash = await hashSecret("pin-pepper", "482913");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(hash).not.toContain("482913");
    expect(await verifySecret("pin-pepper", "482913", hash)).toBe(true);
    expect(await verifySecret("pin-pepper", "482914", hash)).toBe(false);
    // Same secret, other purpose: other pepper, so no match.
    expect(await verifySecret("code-pepper", "482913", hash)).toBe(false);
  });

  it("geeft elke keer een andere hash (eigen zout)", async () => {
    const a = await hashSecret("code-pepper", "VALK2027");
    const b = await hashSecret("code-pepper", "VALK2027");
    expect(a).not.toBe(b);
  });

  it("weigert lege of kapotte hashes", async () => {
    expect(await verifySecret("pin-pepper", "1", null)).toBe(false);
    expect(await verifySecret("pin-pepper", "1", "md5$abc")).toBe(false);
    expect(await verifySecret("pin-pepper", "1", "scrypt$x$y$z$a$b")).toBe(false);
  });

  it("werkt niet meer met een ander APP_SECRET", async () => {
    const hash = await hashSecret("pin-pepper", "482913");
    const original = process.env.APP_SECRET;
    process.env.APP_SECRET = "een-heel-ander-geheim-dat-ook-lang-genoeg-is-9876543210";
    try {
      expect(await verifySecret("pin-pepper", "482913", hash)).toBe(false);
    } finally {
      process.env.APP_SECRET = original;
    }
  });
});

describe("sessietokens", () => {
  it("ondertekent en controleert de familiesessie", async () => {
    const token = await createSessionToken("toestel-1");
    const session = await verifySessionToken(token);
    expect(session?.deviceId).toBe("toestel-1");
  });

  it("weigert vervalste, verlopen en verwisselde tokens", async () => {
    const token = await createSessionToken("toestel-1");
    const [header, payload, signature] = token.split(".");
    const forged = `${header}.${Buffer.from(JSON.stringify({ sub: "ander", iss: "valkenburger-spelen", aud: "valk:familie", iat: 1, exp: 9999999999 })).toString("base64url")}.${signature}`;
    expect(await verifySessionToken(forged)).toBeNull();
    expect(await verifySessionToken(`${header}.${payload}.x${signature.slice(1)}`)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();

    const expired = await createSessionToken("toestel-1", Math.floor(Date.now() / 1000) - 121 * 24 * 3600);
    expect(await verifySessionToken(expired)).toBeNull();

    // A staff token is not a family session and vice versa.
    const staff = await createStaffToken({ staffId: "s1", role: "beheerder", name: "B", deviceId: "toestel-1", pinVersion: 1 });
    expect(await verifySessionToken(staff)).toBeNull();
    expect(await verifyStaffToken(token)).toBeNull();
    expect(await verifyStaffToken(staff)).toMatchObject({ staffId: "s1", role: "beheerder", pinVersion: 1 });
  });

  it("ververst de sessie na een week", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(sessionNeedsRefresh({ deviceId: "x", issuedAt: now - 3600 }, now)).toBe(false);
    expect(sessionNeedsRefresh({ deviceId: "x", issuedAt: now - 8 * 24 * 3600 }, now)).toBe(true);
  });

  it("maakt een vaste, niet-geheime id van het toesteltoken", async () => {
    const a = await deviceIdFromToken("geheim-token-1");
    expect(a).toBe(await deviceIdFromToken("geheim-token-1"));
    expect(a).not.toBe(await deviceIdFromToken("geheim-token-2"));
    expect(a).not.toContain("geheim");
    expect(a).toHaveLength(22);
  });
});
