/**
 * Family code and PIN rules, shared by the forms (instant feedback) and the
 * server (the real check).
 */

/**
 * Codes are compared without case, spaces, dashes or dots, and accents are
 * dropped: "valk 2027", "VALK-2027" and "Valk2027" are the same code.
 */
export function normalizeFamilyCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[\s\-_.·]/g, "");
}

export const FAMILY_CODE_MIN = 6;
export const FAMILY_CODE_MAX = 32;

/** Error text for a new family code, or null when it is fine. */
export function familyCodeProblem(code: string): string | null {
  if (code.length < FAMILY_CODE_MIN) {
    return `Maak de code minstens ${FAMILY_CODE_MIN} tekens lang.`;
  }
  if (code.length > FAMILY_CODE_MAX) return `Maak de code hoogstens ${FAMILY_CODE_MAX} tekens lang.`;
  if (!/^[A-Z0-9]+$/.test(code)) return "Gebruik alleen letters en cijfers.";
  if (/^(.)\1+$/.test(code)) return "Kies een code die niet uit één teken bestaat.";
  return null;
}

export const PIN_LENGTH = 6;

export function normalizePin(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s/g, "");
}

/** Error text for a new PIN, or null when it is fine. */
export function pinProblem(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "Een PIN bestaat alleen uit cijfers.";
  if (pin.length !== PIN_LENGTH) return `Een PIN heeft precies ${PIN_LENGTH} cijfers.`;
  if (/^(\d)\1+$/.test(pin)) return "Kies een PIN die niet uit één cijfer bestaat.";
  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return "Kies een PIN die geen oplopende of aflopende reeks is.";
  return null;
}

const WORDS = [
  "VALK", "KRANS", "DOMMEL", "HEIDE", "LAUWER", "ZESKAMP", "MEDAILLE", "PODIUM",
  "JOKER", "HEMEL", "KAMPIOEN", "BEKER", "WIMPEL", "FANFARE",
];

/** A memorable proposal like "KRANS-4827", for the admin's convenience. */
export function suggestFamilyCode(random: () => number = Math.random): string {
  const word = WORDS[Math.floor(random() * WORDS.length)];
  const number = String(Math.floor(random() * 9000) + 1000);
  return `${word}-${number}`;
}
