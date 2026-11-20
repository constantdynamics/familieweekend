import "server-only";
import { formatTime } from "@/lib/shared/time";
import { checkLimit, LIMITS, networkSubject, recordAttempt, type AttemptKind } from "./rate-limit";

export type PinOutcome<T> = { ok: T } | { fout: string };

/**
 * A PIN attempt with the limits of SPEC §3: 5 failures per 10 minutes per
 * device and role, plus a wider net per network.
 */
export async function tryPin<T>(kind: AttemptKind, deviceId: string, attempt: () => Promise<T | null>): Promise<PinOutcome<T>> {
  const device = await checkLimit(kind, deviceId, LIMITS.pinPerDevice);
  const network = await networkSubject();
  const net = await checkLimit(kind, network, LIMITS.pinPerNetwork);
  const blocked = device.blocked ? device : net.blocked ? net : null;
  if (blocked?.retryAt) return { fout: `Te veel pogingen. Probeer het om ${formatTime(blocked.retryAt)} opnieuw.` };
  const match = await attempt();
  await recordAttempt(kind, deviceId, match !== null);
  await recordAttempt(kind, network, match !== null);
  if (match === null) {
    const left = Math.min(device.remaining, net.remaining) - 1;
    return {
      fout:
        left > 0
          ? `Die PIN klopt niet. Je kunt het nog ${left} keer proberen.`
          : "Die PIN klopt niet. Wacht nu tien minuten voor je het opnieuw probeert.",
    };
  }
  return { ok: match };
}
