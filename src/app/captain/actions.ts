"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActionContext } from "@/lib/server/context";
import { ring } from "@/lib/server/live";
import { logError } from "@/lib/server/log";
import { tryPin } from "@/lib/server/pin-login";
import { findTeamByPin, takeCaptainDevice } from "@/lib/server/teams";
import { CAPTAIN_COOKIE, CAPTAIN_MAX_AGE_S, cookieBase, createCaptainToken } from "@/lib/server/tokens";
import { normalizePin } from "@/lib/shared/codes";
import { safeReturnPath } from "@/lib/shared/paths";

export type CaptainState = { fout?: string };

/** Log in with the team PIN: this phone becomes the team device. */
export async function wordCaptain(_previous: CaptainState, formData: FormData): Promise<CaptainState> {
  const ctx = await getActionContext();
  if (!ctx.deviceId) redirect("/welkom?terug=/captain");
  const pin = normalizePin(formData.get("pin"));
  if (!pin) return { fout: "Vul de team-PIN in." };
  try {
    const result = await tryPin(`pin:captain:${ctx.env}`, ctx.deviceId, () =>
      /^\d{4,8}$/.test(pin) ? findTeamByPin(ctx.env, pin) : Promise.resolve(null),
    );
    if ("fout" in result) return { fout: result.fout };
    const team = result.ok;
    await takeCaptainDevice(ctx.env, team.id, ctx.deviceId);
    const store = await cookies();
    store.set(
      CAPTAIN_COOKIE,
      await createCaptainToken({ teamId: team.id, env: ctx.env, pinVersion: team.pinVersion, deviceId: ctx.deviceId }),
      cookieBase(CAPTAIN_MAX_AGE_S),
    );
    await ring(ctx.env);
  } catch (error) {
    logError("captain.inloggen", error);
    return { fout: "Er ging iets mis aan onze kant. Probeer het over een minuut opnieuw." };
  }
  redirect(safeReturnPath(formData.get("terug"), "/captain"));
}

export async function stopAlsCaptain(): Promise<void> {
  const store = await cookies();
  store.delete(CAPTAIN_COOKIE);
  redirect("/");
}
