"use server";

import { updateTag } from "next/cache";
import { getActionContext } from "@/lib/server/context";
import { FUNFACTS_TAG, FunfactError, getFunfactQuestion, saveFunfactAnswer } from "@/lib/server/funfacts";
import { logError } from "@/lib/server/log";
import { readSettings } from "@/lib/server/settings";
import { funfactsPhase, parseValue, type FunfactValue } from "@/lib/shared/funfacts";
import { formatDayMonth } from "@/lib/shared/time";

export type BewaarInvoer = {
  deelnemer: string;
  vraag: string;
  waarde: unknown;
  overgeslagen: boolean;
};

export type BewaarUitkomst = { ok: true; klaar: boolean } | { ok: false; fout: string };

/**
 * Save one answer (or a skip) right away, so nothing is lost when the phone
 * dies halfway. Only for a name on this device, only while the list is open
 * (server time), and the value must fit the question.
 */
export async function bewaarAntwoord(invoer: BewaarInvoer): Promise<BewaarUitkomst> {
  const ctx = await getActionContext();
  if (!ctx.deviceId) return { ok: false, fout: "Vul eerst de familiecode in." };
  if (ctx.viewAs) return { ok: false, fout: "Je bekijkt de app als iemand anders. Invullen kan dan niet." };
  if (typeof invoer !== "object" || invoer === null) return { ok: false, fout: "Dit antwoord kwam niet goed aan. Probeer het nog eens." };

  const persoon = ctx.names.find((n) => n.id === invoer.deelnemer);
  if (!persoon) return { ok: false, fout: "Je kunt alleen invullen voor de namen op deze telefoon. Kies je naam opnieuw." };

  try {
    const settings = await readSettings();
    const fase = funfactsPhase(settings.funfactsOpenAt, settings.funfactsDeadline, Date.now());
    if (fase === "voor") {
      return { ok: false, fout: `De fun facts gaan pas open op ${formatDayMonth(new Date(settings.funfactsOpenAt))}.` };
    }
    if (fase === "dicht") return { ok: false, fout: "De lijst is gesloten, dank je wel!" };

    const vraag = await getFunfactQuestion(String(invoer.vraag ?? ""));
    if (!vraag || !vraag.active) return { ok: false, fout: "Deze vraag bestaat niet meer. Ververs de pagina." };

    let waarde: FunfactValue | null = null;
    const overgeslagen = invoer.overgeslagen === true;
    if (!overgeslagen) {
      const gelezen = parseValue(vraag, invoer.waarde);
      if (!gelezen.ok) return { ok: false, fout: gelezen.fout };
      waarde = gelezen.value;
    }

    const uitkomst = await saveFunfactAnswer(ctx.env, persoon.id, vraag.id, waarde, overgeslagen);
    // The counter on Thuis ("32 van de 45 familieleden zijn klaar").
    if (uitkomst.becameDone && ctx.env === "live") updateTag(FUNFACTS_TAG);
    return { ok: true, klaar: uitkomst.done };
  } catch (error) {
    if (error instanceof FunfactError) return { ok: false, fout: error.message };
    logError("funfacts.bewaren", error);
    return { ok: false, fout: "Bewaren lukte niet aan onze kant. Probeer het over een minuut opnieuw." };
  }
}
