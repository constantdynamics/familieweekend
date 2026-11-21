import Link from "next/link";
import { Kaart } from "@/components/ui/Kaart";
import { KnopLink } from "@/components/ui/Knop";
import { getFunfactsCount } from "@/lib/server/funfacts";
import type { Settings } from "@/lib/server/settings";
import { doneCounterText, funfactsPhase } from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import { amsterdamParts, formatDayMonth } from "@/lib/shared/time";

/** "Vanaf januari" when the list opens at the very start of a month, else "Vanaf 15 januari". */
function vanaf(openAt: Date): string {
  const p = amsterdamParts(openAt);
  if (p.day === 1 && p.hour === 0 && p.minute === 0) {
    return `Vanaf ${new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", month: "long" }).format(openAt)}`;
  }
  return `Vanaf ${formatDayMonth(openAt)}`;
}

/**
 * The fun facts card on Thuis (SPEC §4.1): a teaser before the opening, then
 * "Vul je fun facts in" with the counter and the deadline, and after the
 * deadline a thank-you with the counter. Part of the cached Thuis page; the
 * counter refreshes when someone finishes.
 */
export async function FunfactsKaart({ settings, now }: { settings: Settings; now: number }) {
  const openAt = new Date(settings.funfactsOpenAt);
  const deadline = new Date(settings.funfactsDeadline);
  // Until the owner releases the new app, the family only sees the teaser.
  const fase = settings.fase2Live ? funfactsPhase(openAt, deadline, now) : "voor";

  if (fase === "voor") {
    return (
      <Kaart aria-labelledby="funfacts-titel" className="mt-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="funfacts-titel" className="m-0 text-[20px] leading-tight font-extrabold">
            Je fun facts
          </h2>
          <span className="rounded-pil bg-studio px-3 py-1 text-klein font-bold whitespace-nowrap text-beeldbuis">{vanaf(openAt)}</span>
        </div>
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar(
            `Op ${formatDayMonth(openAt)} gaat hier een lijst open met luchtige vragen voor de quiz, plus je meest merkwaardige foto. Alleen de organisatie ziet je antwoorden.`,
          )}
        </p>
        <p className="m-0 text-label font-medium">Invullen kan tot {formatDayMonth(deadline)}.</p>
      </Kaart>
    );
  }

  const { done, total } = await getFunfactsCount();
  const teller = doneCounterText(done, total);
  const procent = total > 0 ? Math.round((done / total) * 100) : 0;
  const balk =
    total > 0 ? (
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pil bg-papier-streep">
        <div className="h-full rounded-pil bg-oranje" style={{ width: `${procent}%` }} />
      </div>
    ) : null;

  if (fase === "dicht") {
    return (
      <Kaart aria-labelledby="funfacts-titel" className="mt-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="funfacts-titel" className="m-0 text-[20px] leading-tight font-extrabold">
            Je fun facts
          </h2>
          <span className="rounded-pil bg-studio px-3 py-1 text-klein font-bold whitespace-nowrap text-beeldbuis">Gesloten</span>
        </div>
        <p className="m-0 text-[15px] leading-[1.45] font-bold">De lijst is gesloten, dank je wel!</p>
        {teller ? <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar(teller)}</p> : null}
        {balk}
        <Link href="/funfacts" className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-studio underline underline-offset-4">
          Bekijk je antwoorden
        </Link>
      </Kaart>
    );
  }

  return (
    <Kaart aria-labelledby="funfacts-titel" className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="funfacts-titel" className="m-0 text-[20px] leading-tight font-extrabold">
          Vul je fun facts in
        </h2>
        <span className="rounded-pil bg-studio px-3 py-1 text-klein font-bold whitespace-nowrap text-beeldbuis">
          Tot {formatDayMonth(deadline)}
        </span>
      </div>
      <p className="m-0 text-[15px] leading-[1.45]">
        {bijElkaar("Luchtige vragen voor de quiz, plus je meest merkwaardige foto. Alleen de organisatie ziet je antwoorden.")}
      </p>
      {teller ? <p className="m-0 text-[15px] leading-[1.45] font-bold">{bijElkaar(teller)}</p> : null}
      {balk}
      <KnopLink href="/funfacts" className="mt-1 self-start">
        Open de vragenlijst
      </KnopLink>
    </Kaart>
  );
}
