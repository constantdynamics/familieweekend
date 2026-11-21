"use client";

import "./quiz.css";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { IconSpelen } from "@/components/ui/icons";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop, KnopLink } from "@/components/ui/Knop";
import type { OefenFase, OefenStap } from "@/lib/server/quiz/oefenplan";
import type { Answer, QuizView } from "@/lib/server/quiz/types";
import { oefenMaximum } from "@/lib/shared/oefenen";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { abonneerGeluid, leesGeluid } from "./hulp";
import { Aankondiging, Kop, OVERNAME_CSS, RondeScherm, VraagScherm } from "./QuizScherm";

type Terug = { href: string; label: string };
type Score = { twelfths: number; max: number; schattingen: number };

type Props = {
  quizId: string;
  stappen: OefenStap[];
  /** The first step, already built by the server. */
  eerste: QuizView;
  terug: Terug;
};

/** One step from the server: the captain's view of the practice team. Nothing is stored there. */
async function haal(body: { quiz: string; ronde: number; vraag: string | null; fase: OefenFase; antwoord: Answer | null }) {
  try {
    const response = await fetch("/api/quiz/oefenen", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as QuizView & { fout?: string };
    if (!response.ok) return { ok: false as const, fout: data.fout ?? "Dat lukte niet. Probeer het nog een keer." };
    return { ok: true as const, view: data as QuizView };
  } catch {
    return { ok: false as const, fout: "Geen verbinding. Probeer het opnieuw zodra je weer internet hebt." };
  }
}

/**
 * Practising the quiz (owner's choices): exactly the captain's screen, made
 * by the same components and the same server code as on the evening, for
 * one question, one round or the whole quiz. You are also the quizmaster:
 * you reveal the answer yourself. No timer, no joker, nothing stored.
 */
export function Oefenen({ quizId, stappen, eerste, terug }: Props) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState(eerste);
  const [fase, setFase] = useState<OefenFase>(stappen[0]?.vraag ? "open" : "rondescherm");
  const [antwoord, setAntwoord] = useState<Answer | null>(null);
  const [score, setScore] = useState<Score>({ twelfths: 0, max: 0, schattingen: 0 });
  const [klaar, setKlaar] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  // Sound like a captain: on unless switched off on this phone.
  const geluidAan = useSyncExternalStore(abonneerGeluid, leesGeluid, () => null) ?? true;

  const stap = stappen[index];
  const volgende = stappen[index + 1];
  const vragen = stappen.filter((s) => s.vraag !== null).length;

  /** The answer stays here; the server only shows it back in the captain's view. */
  const kies = async (nieuw: Answer): Promise<{ ok: true } | { ok: false; fout: string }> => {
    const result = await haal({ quiz: quizId, ronde: stap.ronde, vraag: stap.vraag, fase: "open", antwoord: nieuw });
    if (!result.ok) return result;
    setAntwoord(result.view.me.answer ?? nieuw);
    setView(result.view);
    return { ok: true };
  };

  const ga = async (doel: OefenStap, doelFase: OefenFase, doelAntwoord: Answer | null): Promise<QuizView | null> => {
    setBezig(true);
    setFout(null);
    const result = await haal({ quiz: quizId, ronde: doel.ronde, vraag: doel.vraag, fase: doelFase, antwoord: doelAntwoord });
    setBezig(false);
    if (!result.ok) {
      setFout(result.fout);
      return null;
    }
    window.scrollTo(0, 0);
    return result.view;
  };

  const onthul = async () => {
    const nieuw = await ga(stap, "onthuld", antwoord);
    if (!nieuw) return;
    setView(nieuw);
    setFase("onthuld");
    const kind = nieuw.question?.kind;
    const max = kind ? oefenMaximum(kind) : null;
    const behaald = nieuw.teams[0]?.result?.twelfths ?? 0;
    setScore((oud) => (max === null ? { ...oud, schattingen: oud.schattingen + 1 } : { ...oud, twelfths: oud.twelfths + behaald, max: oud.max + max }));
  };

  const verder = async () => {
    if (!volgende) {
      setKlaar(true);
      window.scrollTo(0, 0);
      return;
    }
    const doelFase: OefenFase = volgende.vraag ? "open" : "rondescherm";
    const nieuw = await ga(volgende, doelFase, null);
    if (!nieuw) return;
    setIndex(index + 1);
    setView(nieuw);
    setFase(doelFase);
    setAntwoord(null);
  };

  if (!stap) return null;

  return (
    <>
      {/* Like the real quiz: no menu while practising. */}
      <span data-quiz-overname="" hidden />
      <style>{OVERNAME_CSS}</style>
      <div className="mb-4 flex items-center gap-3 rounded-[18px] border-2 border-dashed border-mosterd py-1 pr-2 pl-4">
        <IconSpelen size={22} className="flex-none text-mosterd" />
        <p className="m-0 flex-1 text-[15px] leading-[1.35]">
          <strong>Oefenen.</strong> {bijElkaar("Je speelt als captain. Er wordt niets bewaard.")}
        </p>
        <Link href={terug.href} className="inline-flex min-h-11 items-center px-2 text-[15px] font-bold text-mosterd underline underline-offset-4">
          Stop
        </Link>
      </div>

      {klaar ? (
        <Eindscore score={score} vragen={vragen} terug={terug} />
      ) : (
        <>
          <Aankondiging view={view} />
          <Kop view={view} />
          <div className="mt-4 flex flex-col gap-4">
            {fase === "rondescherm" ? (
              <RondeScherm view={view} onKlaar={() => {}} />
            ) : (
              <VraagScherm key={stap.vraag} view={view} ontvangen={null} geluidAan={geluidAan} onKlaar={() => {}} onAntwoord={kies} ringen />
            )}

            <section aria-label="Oefenen" className="flex flex-col gap-3 rounded-[18px] border-2 border-dashed border-mosterd p-4">
              {fase === "rondescherm" ? (
                <Knop disabled={bezig} onClick={() => void verder()}>
                  {bezig ? "Bezig…" : "Naar de eerste vraag"}
                </Knop>
              ) : fase === "open" ? (
                <>
                  <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar("Jij bent nu ook de quizmaster: onthul het antwoord als je klaar bent.")}</p>
                  <Knop disabled={bezig} onClick={() => void onthul()}>
                    {bezig ? "Bezig…" : "Onthul het antwoord"}
                  </Knop>
                </>
              ) : (
                <>
                  {view.question?.kind === "schatting" ? <SchattingUitleg view={view} /> : null}
                  {volgende ? (
                    <Knop disabled={bezig} onClick={() => void verder()}>
                      {bezig ? "Bezig…" : volgende.vraag ? "Volgende vraag" : "Naar de volgende ronde"}
                    </Knop>
                  ) : vragen > 1 ? (
                    <Knop onClick={() => void verder()}>Bekijk je score</Knop>
                  ) : (
                    <KnopLink href={terug.href}>Klaar</KnopLink>
                  )}
                </>
              )}
              {fout ? <Melding tone="fout">{bijElkaar(fout)}</Melding> : null}
            </section>
          </div>
        </>
      )}
    </>
  );
}

/** Alone you are always closest: say what the real evening does, and how far off you were. */
function SchattingUitleg({ view }: { view: QuizView }) {
  const verschil = view.teams[0]?.result?.difference ?? null;
  const eenheid = view.question?.unit ? ` ${view.question.unit}` : "";
  const ernaast = verschil === null ? "" : ` Jij zat er ${new Intl.NumberFormat("nl-NL").format(verschil)}${eenheid} naast.`;
  return (
    <p className="m-0 text-[15px] leading-[1.4]">
      {bijElkaar(`Op de avond krijgt het team dat er het dichtst bij zit de punt. Alleen zit je er altijd het dichtst bij, dus deze vraag telt niet mee.${ernaast}`)}
    </p>
  );
}

function Eindscore({ score, vragen, terug }: { score: Score; vragen: number; terug: Terug }) {
  const punten = (twelfths: number) => `${formatPoints(twelfths)} ${formatPoints(twelfths) === "1" ? "punt" : "punten"}`;
  return (
    <Kaart className="flex flex-col gap-3">
      <h1 className="m-0 text-[24px] leading-tight font-extrabold">Klaar met oefenen</h1>
      {score.max > 0 ? (
        <p className="m-0 text-[18px] leading-[1.4] font-bold">
          {bijElkaar(`Je haalde ${punten(score.twelfths)} van de ${formatPoints(score.max)} bij ${vragen} ${vragen === 1 ? "vraag" : "vragen"}.`)}
        </p>
      ) : null}
      {score.schattingen > 0 ? (
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar(score.schattingen === 1 ? "De schattingsvraag telt niet mee: alleen zit je er altijd het dichtst bij." : "De schattingsvragen tellen niet mee: alleen zit je er altijd het dichtst bij.")}
        </p>
      ) : null}
      <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar("Er is niets bewaard. De punten tellen nergens mee.")}</p>
      <KnopLink href={terug.href} className="self-start">
        {terug.label}
      </KnopLink>
    </Kaart>
  );
}
