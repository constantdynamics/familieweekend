"use server";

import { redirect } from "next/navigation";
import { checkFamilyCode } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { readSettings } from "@/lib/server/settings";
import { logError } from "@/lib/server/log";
import { checkLimit, LIMITS, networkSubject, recordAttempt } from "@/lib/server/rate-limit";
import { startFamilySession } from "@/lib/server/session";
import { normalizeFamilyCode } from "@/lib/shared/codes";
import { safeReturnPath } from "@/lib/shared/paths";
import { formatTime } from "@/lib/shared/time";

export type CodeState = { fout?: string; code?: string };

export async function controleerFamiliecode(_previous: CodeState, formData: FormData): Promise<CodeState> {
  const typed = String(formData.get("code") ?? "").slice(0, 64);
  const code = normalizeFamilyCode(typed);
  if (!code) {
    return { fout: "Vul de familiecode in. Je vindt hem in het bericht in de familie-app." };
  }

  let nextStep = false;
  try {
    const subject = await networkSubject();
    const limit = await checkLimit("familiecode", subject, LIMITS.familyCodePerNetwork);
    if (limit.blocked && limit.retryAt) {
      return {
        fout: `Te vaak een verkeerde code geprobeerd. Probeer het om ${formatTime(limit.retryAt)} opnieuw.`,
        code: typed,
      };
    }
    const ok = await checkFamilyCode(code);
    await recordAttempt("familiecode", subject, ok);
    if (!ok) {
      return { fout: "Die code klopt niet. Kijk nog eens in het bericht in de familie-app.", code: typed };
    }
    const session = await startFamilySession();
    // Once the names are in, the next step is "Wie ben jij?" (SPEC §3).
    nextStep = await nameStepNeeded(session.deviceId);
  } catch (error) {
    logError("familiecode", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw.", code: typed };
  }

  const terug = safeReturnPath(formData.get("terug"));
  redirect(nextStep ? `/wie-ben-jij?terug=${encodeURIComponent(terug)}` : terug);
}

async function nameStepNeeded(deviceId: string): Promise<boolean> {
  const settings = await readSettings();
  if (!settings.fase2Live) return false;
  const [row] = await db()<{ names: number; mine: number }[]>`
    select count(*)::int as names,
           count(*) filter (where claimed_device_id = ${deviceId})::int as mine
    from valk.participants where env = 'live'
  `;
  return Boolean(row && row.names > 0 && row.mine === 0);
}
