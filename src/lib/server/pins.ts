import "server-only";
import { PIN_LENGTH, pinProblem } from "@/lib/shared/codes";

/** A random PIN that follows the rules (no 111111, no 123456). */
export function generatePin(): string {
  for (;;) {
    const digits = new Uint8Array(PIN_LENGTH);
    crypto.getRandomValues(digits);
    const pin = [...digits].map((d) => String(d % 10)).join("");
    if (!pinProblem(pin)) return pin;
  }
}
