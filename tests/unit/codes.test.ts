import { describe, expect, it } from "vitest";
import { familyCodeProblem, normalizeFamilyCode, normalizePin, pinProblem, suggestFamilyCode } from "@/lib/shared/codes";
import { safeReturnPath } from "@/lib/shared/paths";
import { detectPlatform } from "@/lib/shared/platform";

describe("familiecode", () => {
  it("negeert hoofdletters, spaties, streepjes en accenten", () => {
    expect(normalizeFamilyCode(" valk-2027 ")).toBe("VALK2027");
    expect(normalizeFamilyCode("Valk 20.27")).toBe("VALK2027");
    expect(normalizeFamilyCode("Pluïmé")).toBe("PLUIME");
    expect(normalizeFamilyCode(undefined)).toBe("");
    expect(normalizeFamilyCode(42)).toBe("");
  });

  it("keurt te korte, rare of eentonige codes af", () => {
    expect(familyCodeProblem("VALK")).toMatch(/minstens 6/);
    expect(familyCodeProblem("A".repeat(33))).toMatch(/hoogstens 32/);
    expect(familyCodeProblem("VALK2027")).toBeNull();
    expect(familyCodeProblem("VALK!2027")).toMatch(/letters en cijfers/);
    expect(familyCodeProblem("AAAAAAA")).toMatch(/één teken/);
  });

  it("bedenkt een code die door de eigen regels komt", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = suggestFamilyCode();
      expect(familyCodeProblem(normalizeFamilyCode(code))).toBeNull();
    }
  });
});

describe("PIN", () => {
  it("wil precies zes cijfers zonder reeks", () => {
    expect(pinProblem("48291")).toMatch(/precies 6/);
    expect(pinProblem("48291a")).toMatch(/alleen uit cijfers/);
    expect(pinProblem("111111")).toMatch(/één cijfer/);
    expect(pinProblem("123456")).toMatch(/reeks/);
    expect(pinProblem("890123")).toMatch(/reeks/);
    expect(pinProblem("654321")).toMatch(/reeks/);
    expect(pinProblem("482913")).toBeNull();
    expect(normalizePin(" 482 913 ")).toBe("482913");
  });
});

describe("terugpad na de code", () => {
  it("laat alleen paden binnen de app toe", () => {
    expect(safeReturnPath("/programma")).toBe("/programma");
    expect(safeReturnPath("/beheer?x=1")).toBe("/beheer?x=1");
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/welkom")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });
});

describe("platform", () => {
  it("herkent iPhone, iPad, Android en de rest", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("anders");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("anders");
  });
});
