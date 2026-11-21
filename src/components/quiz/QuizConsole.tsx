"use client";

import "./quiz.css";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { IntermezzoBediening } from "@/components/intermezzo/IntermezzoBediening";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconJoker, IconMuzieknoot, IconPijlTerug, IconVinkje } from "@/components/ui/icons";
import { IconWeegschaal } from "@/components/ui/icons-quiz";
import { Chip, Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { useLive } from "@/lib/client/live";
import type { ConsoleQuestion, ConsoleTeam, ConsoleView } from "@/lib/server/quiz/types";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { stuur, useWakeLock } from "./hulp";
import { korteNaam, QuizFoto, StandLijst } from "./onderdelen";
import { TILE } from "./tegelKleuren";

function abonneer(onChange: () => void) {
  const timer = setInterval(onChange, 250);
  return () => clearInterval(timer);
}
const stil = () => () => {};
const kwartTik = () => Math.floor(Date.now() / 250) * 250;

/**
 * The quizmaster's console (SPEC §4.6): the question with the right answer
 * marked (only here), the note, the status per team, the buttons in their
 * fixed order, "Nog 10 seconden!", listening mode, corrections, the joker
 * panel, the interim standing and, in the test environment, test teams
 * that answer by themselves.
 */
export function QuizConsole({ initial }: { initial: ConsoleView }) {
  const [review, setReview] = useState<string | null>(null);
  const { data, error, updatedAt, refresh } = useLive<ConsoleView>(`/api/quiz/console${review ? `?vraag=${review}` : ""}`, initial);
  const view = data ?? initial;
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState<string | null>(null);
  useWakeLock(view.mode === "quiz" || view.mode === "intermezzo");

  const stap = async (actie: string, extra: Record<string, unknown> = {}, metVanaf = true) => {
    setBezig(actie);
    setFout(null);
    setGelukt(null);
    const vanaf = { phase: view.phase, questionId: view.question?.id ?? null, roundNo: view.round?.number ?? null };
    const result = await stuur("/api/quiz/console", { actie, ...(metVanaf ? { vanaf } : {}), ...extra });
    setBezig(null);
    if (!result.ok) setFout(result.fout);
    refresh();
    return result.ok;
  };

  // "Nog 10 seconden!": the phones count down, and the console closes the question at 0.
  const nu = useSyncExternalStore(view.countdownMs !== null ? abonneer : stil, kwartTik, () => 0);
  const eind = view.countdownMs !== null && updatedAt !== null ? updatedAt + view.countdownMs : null;
  const resterend = eind !== null && nu > 0 ? Math.max(0, eind - nu) : view.countdownMs;
  const gesloten = useRef<string | null>(null);
  useEffect(() => {
    const vraag = view.question?.id;
    if (view.phase !== "open" || resterend === null || resterend > 0 || !vraag || gesloten.current === vraag) return;
    gesloten.current = vraag;
    void stuur("/api/quiz/console", { actie: "sluit", vanaf: { phase: "gesloten", questionId: vraag, roundNo: view.round?.number ?? null } }).then(refresh);
  }, [view.phase, view.question?.id, view.round?.number, resterend, refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          href="/beheer/quiz"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
        >
          <IconPijlTerug size={20} />
          Quiz
        </Link>
        <Chip>Quizmaster</Chip>
        {view.position && view.mode !== "rust" ? <span className="text-[14px] text-zand">{bijElkaar(view.position)}</span> : null}
        <h1 className="m-0 font-display text-[27px] leading-[1.15] font-normal schaduw-oranje">
          {bijElkaar(
            view.mode === "intermezzo" ? "Intermezzo" : view.mode === "quiz" ? (view.round?.title ?? "De quiz") : (view.quiz?.title ?? "De quiz"),
            12,
          )}
        </h1>
      </div>
      {view.env === "test" ? (
        <p className="m-0 rounded-[16px] border-2 border-dashed border-mosterd bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] font-bold text-mosterd">
          Proefmodus: je bedient de quiz van de proefteams.
        </p>
      ) : null}
      {error ? <p className="m-0 text-label text-zand">Even geen verbinding met de server. De console probeert het steeds opnieuw.</p> : null}
      <div aria-live="polite" className="flex flex-col gap-2">
        {fout ? <Melding tone="fout">{bijElkaar(fout)}</Melding> : null}
        {gelukt ? <Melding tone="goed">{bijElkaar(gelukt)}</Melding> : null}
      </div>

      {view.mode === "rust" || view.mode === "ceremonie" ? (
        <StartKaart view={view} bezig={bezig} onStap={stap} />
      ) : view.mode === "intermezzo" ? (
        <section aria-labelledby="intermezzo-titel" className="flex flex-col gap-3 rounded-kaart bg-studio-licht p-[18px]">
          <h2 id="intermezzo-titel" className="m-0 text-[20px] font-extrabold">
            Steen, papier, schaar
          </h2>
          <IntermezzoBediening />
          <p className="m-0 text-[15px] leading-[1.45] text-zand">
            {bijElkaar(`Klaar met het intermezzo? Dan gaan alle telefoons naar ${view.round ? `het rondescherm na ronde ${view.round.number}` : "de quiz"}.`)}
          </p>
          <Knop size="groot" disabled={bezig !== null} onClick={() => void stap("terugNaarQuiz")}>
            Terug naar de quiz
          </Knop>
        </section>
      ) : (
        <Bediening view={view} bezig={bezig} resterend={resterend} onStap={stap} />
      )}

      {view.mode === "quiz" && view.botsAllowed ? <Nepteams view={view} /> : null}

      {view.quiz && view.phase !== null && view.played.length > 0 ? (
        <Correcties
          view={view}
          review={review}
          onKies={setReview}
          onBewaar={async (team, punten) => {
            const ok = await stap("correctie", { vraag: review ?? view.question?.id, team, punten }, false);
            if (ok) setGelukt(punten === null ? "De berekende punten gelden weer." : "Punten gecorrigeerd.");
          }}
          bezig={bezig !== null}
        />
      ) : null}

      {view.quiz && view.phase !== null ? (
        <Jokers
          view={view}
          bezig={bezig !== null}
          onZet={async (team, ronde) => {
            const ok = await stap("joker", { team, ronde }, false);
            if (ok) setGelukt(ronde === null ? "Joker weggehaald." : "Joker gezet.");
          }}
        />
      ) : null}

      {view.quiz && view.standings.length > 0 && view.mode === "quiz" && view.phase !== "tussenstand" && view.phase !== "einde" ? (
        <details className="rounded-kaart bg-studio-licht p-4">
          <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold leading-[44px]">Stand van de quiz tot nu toe</summary>
          <div className="mt-3">
            <StandLijst rijen={view.standings} label="Stand van de quiz" />
          </div>
        </details>
      ) : null}

      {view.mode === "quiz" ? (
        <Pauze onPauze={() => void stap("pauze", {}, false)} bezig={bezig !== null} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function StartKaart({
  view,
  bezig,
  onStap,
}: {
  view: ConsoleView;
  bezig: string | null;
  onStap: (actie: string, extra?: Record<string, unknown>, metVanaf?: boolean) => Promise<boolean>;
}) {
  const startbaar = view.quizzes.filter((quiz) => quiz.questions > 0);
  const [gekozen, setGekozen] = useState<string>(view.quiz?.id ?? startbaar[0]?.id ?? "");
  const begonnen = view.quiz !== null && view.phase !== null;
  const mag = view.env === "test" || !begonnen;
  return (
    <>
      {view.phase === "einde" && view.standings.length > 0 ? (
        <section aria-labelledby="eind-titel" className="flex flex-col gap-3">
          <h2 id="eind-titel" className="m-0 text-[20px] font-extrabold">
            De quiz is klaar. Eindstand:
          </h2>
          <StandLijst rijen={view.standings} label="Eindstand van de quiz" />
        </section>
      ) : null}
      {view.resume ? (
        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[20px] font-extrabold">De quiz staat op pauze</h2>
          <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar(`Ga verder waar je was: ${view.resume}.`)}</p>
          <Knop size="groot" disabled={bezig !== null} onClick={() => void onStap("hervat", {}, false)}>
            Ga verder met de quiz
          </Knop>
        </Kaart>
      ) : null}
      {mag ? (
        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[20px] font-extrabold">{begonnen ? "Begin opnieuw" : "Start de quiz"}</h2>
          {startbaar.length === 0 ? (
            <p className="m-0 text-[15px] leading-[1.45]">
              Er staan nog geen vragen klaar. Maak ze in{" "}
              <Link href="/beheer/quiz" className="font-bold text-studio underline">
                Beheer, Quiz
              </Link>
              {view.env === "test" ? ", of zet de proef opnieuw klaar voor de demo-quiz." : "."}
            </p>
          ) : (
            <>
              <p className="m-0 text-[15px] leading-[1.45]">
                {bijElkaar(
                  view.env === "test"
                    ? "In de proef begint de quiz altijd vers: oude proefantwoorden en jokers gaan weg."
                    : "Alle telefoons gaan meteen naar het rondescherm van ronde 1.",
                )}
              </p>
              {startbaar.length > 1 ? (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1.5 p-0 text-[15px] font-bold">Welke quiz?</legend>
                  {startbaar.map((quiz) => (
                    <label key={quiz.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand">
                      <input type="radio" name="quiz" value={quiz.id} checked={gekozen === quiz.id} onChange={() => setGekozen(quiz.id)} className="h-5 w-5 accent-oranje" />
                      <span className="text-[16px] font-bold">{bijElkaar(`${quiz.title} (${quiz.questions} vragen)`)}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <Knop size="groot" disabled={bezig !== null || !gekozen} onClick={() => void onStap("start", { quiz: gekozen }, false)}>
                {bezig === "start" ? "Bezig…" : begonnen ? "Begin de quiz opnieuw" : "Start de quiz"}
              </Knop>
            </>
          )}
        </Kaart>
      ) : null}
    </>
  );
}

function Schakel({ aan, label, uitleg, onWissel, disabled }: { aan: boolean; label: string; uitleg: string; onWissel: () => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-studio-licht px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={`${id}-label`} className="text-[16px] font-extrabold">
          {bijElkaar(label)}
        </span>
        <span id={`${id}-uitleg`} className="text-[14px] leading-[1.35] text-zand">
          {bijElkaar(uitleg)}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={aan}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-uitleg`}
        disabled={disabled}
        onClick={onWissel}
        className={`relative inline-flex h-11 w-[72px] flex-none items-center rounded-pil border-[3px] border-studio transition-colors ${aan ? "bg-avocado-licht" : "bg-zand"}`}
      >
        <span aria-hidden="true" className={`absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-pil bg-studio transition-[left] ${aan ? "left-[34px]" : "left-[4px]"}`} />
        <span className="sr-only">{aan ? "Aan" : "Uit"}</span>
      </button>
    </div>
  );
}

function statusVan(team: ConsoleTeam, view: ConsoleView): { tekst: string; goed: boolean } {
  if (view.phase === "onthuld" && team.twelfths !== null) {
    const joker = team.jokerRound !== null && team.jokerRound === view.round?.number;
    return { tekst: team.twelfths > 0 ? `+${formatPoints(team.twelfths)}${joker ? " joker" : ""}` : "0", goed: team.twelfths > 0 };
  }
  if (view.phase === "open") return team.answered ? { tekst: "geantwoord", goed: true } : { tekst: "denkt na", goed: false };
  if (view.phase === "gesloten") return team.answered ? { tekst: team.answerLabel ?? "geantwoord", goed: true } : { tekst: "te laat", goed: false };
  return { tekst: team.hasDevice ? "captain klaar" : "geen captain", goed: team.hasDevice };
}

function Bediening({
  view,
  bezig,
  resterend,
  onStap,
}: {
  view: ConsoleView;
  bezig: string | null;
  resterend: number | null;
  onStap: (actie: string, extra?: Record<string, unknown>, metVanaf?: boolean) => Promise<boolean>;
}) {
  const vraag = view.question;
  const knoppen = view.buttons;
  const jokersHier = view.teams.filter((team) => team.jokerRound !== null && team.jokerRound === view.round?.number);
  return (
    <>
      <Schakel
        aan={view.listening}
        label="Luistermodus"
        uitleg={view.listening ? "Telefoons tonen alleen: luister goed. Captains zien de antwoorden." : "Iedereen ziet de vraag en de antwoorden."}
        disabled={bezig !== null}
        onWissel={() => void onStap("luister", { aan: !view.listening }, false)}
      />

      {vraag?.note ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-mosterd px-4 py-3 text-studio">
          <IconMuzieknoot size={30} className="flex-none" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[16px] font-extrabold">Notitie voor jou</span>
            <span className="text-[15px] leading-[1.4]">{bijElkaar(`${vraag.note} Alleen jij ziet dit.`)}</span>
          </div>
        </div>
      ) : null}

      {view.phase === "rondescherm" && view.round ? (
        <Kaart className="flex flex-col gap-2">
          <h2 className="m-0 text-[19px] font-extrabold">{bijElkaar(`Rondescherm: ${view.round.title}`)}</h2>
          {view.round.intro ? <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar(view.round.intro)}</p> : null}
          <p className="m-0 text-[15px] leading-[1.45]">
            {jokersHier.length > 0
              ? bijElkaar(`Joker op deze ronde: ${jokersHier.map((team) => korteNaam(team.name)).join(", ")}.`)
              : bijElkaar("De captains kunnen nu hun joker inzetten.")}
          </p>
        </Kaart>
      ) : null}

      {vraag ? <VraagKaart vraag={vraag} /> : null}

      {view.upNext ? (
        <div className="flex flex-col gap-1 rounded-[18px] border-2 border-dashed border-zand px-4 py-3">
          <span className="text-[14px] font-bold text-zand">{bijElkaar(`Hierna, vraag ${view.upNext.number}`)}</span>
          <span className="text-[15px] leading-[1.4]">{bijElkaar(view.upNext.text)}</span>
          {view.upNext.note ? <span className="text-[15px] leading-[1.4] font-bold text-mosterd">{bijElkaar(view.upNext.note)}</span> : null}
        </div>
      ) : null}

      {view.fairness && (view.phase === "rondescherm" || vraag) ? (
        <p className="m-0 flex items-start gap-2.5 text-[14px] leading-[1.35] text-zand">
          <IconWeegschaal size={20} className="mt-px flex-none text-avocado-licht" />
          <span>{bijElkaar(`Deze ronde: ${view.fairness.replace("Voorkennis per team: ", "voorkennis per team ")}.`)}</span>
        </p>
      ) : null}

      {view.phase === "tussenstand" || view.phase === "einde" ? (
        <section aria-labelledby="console-stand" className="flex flex-col gap-3">
          <h2 id="console-stand" className="m-0 text-[20px] font-extrabold">
            {view.phase === "einde" ? "Eindstand van de quiz" : `Tussenstand na ronde ${view.round?.number ?? ""}`}
          </h2>
          <StandLijst rijen={view.standings} label="Tussenstand" />
        </section>
      ) : (
        <section aria-labelledby="console-teams" className="flex flex-col gap-2">
          <h2 id="console-teams" className="m-0 text-[14px] font-bold text-zand">
            {vraag
              ? bijElkaar(`${view.answeredCount} van ${view.teams.length} teams ${view.answeredCount === 1 ? "heeft" : "hebben"} geantwoord`)
              : "De teams"}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[400px]:grid-cols-2">
            {view.teams.map((team) => {
              const status = statusVan(team, view);
              return (
                <li key={team.id} className="flex min-h-11 items-center gap-2 rounded-pil bg-studio-licht py-1.5 pr-3 pl-2.5 text-[14px] font-bold">
                  <TeamVlak kleur={team.color} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 leading-tight">{bijElkaar(korteNaam(team.name))}</span>
                  <span className={`text-right text-klein leading-tight ${status.goed ? "text-avocado-licht" : "text-zand"}`}>{bijElkaar(status.tekst)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {resterend !== null && view.phase === "open" ? (
        <p className="quiz-plof m-0 self-start rounded-pil bg-roest px-4 py-1.5 text-[15px] font-extrabold text-beeldbuis">
          {Math.ceil(resterend / 1000) > 0 ? `Teams zien nu: nog ${Math.ceil(resterend / 1000)} seconden` : "De tijd is om"}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        {knoppen.canCountdown ? (
          <Knop variant="secundair" size="groot" disabled={bezig !== null} onClick={() => void onStap("nog10")}>
            Nog 10 seconden!
          </Knop>
        ) : null}
        {knoppen.main ? (
          <Knop size="groot" className="min-w-[200px] flex-1" disabled={bezig !== null} onClick={() => void onStap(knoppen.main!.command)}>
            {bezig === knoppen.main.command ? "Bezig…" : knoppen.main.label}
          </Knop>
        ) : null}
      </div>
      {knoppen.extra.map((knop) => (
        <Knop
          key={knop.command}
          variant={knop.command === "intermezzo" && view.round?.intermezzoAfter ? "primair" : "secundair"}
          disabled={bezig !== null}
          onClick={() => void onStap(knop.command)}
        >
          {knop.label}
        </Knop>
      ))}
      {knoppen.canGoBack ? (
        <Knop variant="tekst" className="self-start" disabled={bezig !== null} onClick={() => void onStap("vorige")}>
          Ga terug naar vorige vraag
        </Knop>
      ) : null}
    </>
  );
}

/** The question with the right answer marked "goed": only on this screen. */
function VraagKaart({ vraag }: { vraag: ConsoleQuestion }) {
  return (
    <>
      {vraag.photoUrl ? (
        <QuizFoto
          src={vraag.photoUrl}
          alt={`Foto bij vraag ${vraag.number}`}
          onderschrift={vraag.submitter ? `Ingezonden door ${vraag.submitter}` : vraag.photoCredit}
        />
      ) : null}
      <Kaart className="flex flex-col gap-2">
        <h2 className="m-0 text-[19px] leading-[1.25] font-extrabold">{bijElkaar(vraag.text)}</h2>
        {vraag.options ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {vraag.options.map((option, index) => (
              <li
                key={index}
                className={`flex min-h-[40px] items-center gap-2.5 rounded-tegel px-2.5 ${index === vraag.correctChoice ? "bg-papier-streep" : ""}`}
              >
                <span aria-hidden="true" className={`h-[26px] w-[26px] flex-none rounded-[8px] ${TILE[index] ?? "bg-zand"}`} />
                <span className="flex-1 text-[16px] font-bold">{bijElkaar(option)}</span>
                {index === vraag.correctChoice ? (
                  <span className="rounded-pil bg-studio px-2 py-0.5 text-klein font-extrabold text-beeldbuis">goed</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 flex items-center gap-2 rounded-tegel bg-papier-streep px-3 py-2 text-[16px] font-bold">
            <IconVinkje size={20} className="flex-none" />
            <span>{bijElkaar(`Goed: ${vraag.correctLabel}`)}</span>
          </p>
        )}
        {vraag.explanation ? <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(`Uitleg bij de onthulling: ${vraag.explanation}`)}</p> : null}
        {vraag.subjects.length > 0 ? (
          <p className="m-0 text-label">{bijElkaar(`Voorkennis: ${vraag.subjects.join(", ")}`)}</p>
        ) : null}
      </Kaart>
    </>
  );
}

/* ------------------------------------------------------------------------ */

function Correcties({
  view,
  review,
  onKies,
  onBewaar,
  bezig,
}: {
  view: ConsoleView;
  review: string | null;
  onKies: (id: string | null) => void;
  onBewaar: (team: string, punten: string | null) => Promise<void>;
  bezig: boolean;
}) {
  const [invoer, setInvoer] = useState<Record<string, string>>({});
  const gekozen = review ?? "";
  return (
    <details className="rounded-kaart bg-studio-licht p-4" onToggle={(event) => !(event.target as HTMLDetailsElement).open && onKies(null)}>
      <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold leading-[44px]">Corrigeer punten</summary>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-[15px] font-bold" htmlFor="correctie-vraag">
          Welke vraag?
        </label>
        <select
          id="correctie-vraag"
          className="min-h-[52px] w-full rounded-tegel border-[3px] border-studio bg-papier px-3 text-[16px] text-studio"
          value={gekozen}
          onChange={(event) => onKies(event.target.value || null)}
        >
          <option value="">Kies een vraag</option>
          {view.played.map((vraag) => (
            <option key={vraag.id} value={vraag.id}>
              {vraag.label.length > 70 ? `${vraag.label.slice(0, 68)}…` : vraag.label}
            </option>
          ))}
        </select>
        {view.review ? (
          <>
            <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(`Goed antwoord: ${view.review.question.correctLabel}`)}</p>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {view.review.teams.map((team) => (
                <li key={team.id} className="flex flex-col gap-2 rounded-[16px] bg-studio px-3.5 py-3">
                  <span className="flex items-center gap-2 text-[16px] font-extrabold">
                    <TeamVlak kleur={team.color} />
                    {bijElkaar(korteNaam(team.name))}
                  </span>
                  <span className="text-[14px] leading-[1.35] text-zand">
                    {bijElkaar(
                      `Antwoord: ${team.answerLabel ?? "geen antwoord"}. Berekend: ${formatPoints(team.computed ?? 0)}${
                        team.override !== null ? `, gecorrigeerd naar ${formatPoints(team.override)}` : ""
                      }.`,
                    )}
                  </span>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onBewaar(team.id, invoer[team.id] ?? "");
                    }}
                  >
                    <label className="flex flex-col gap-1 text-[14px] font-bold" htmlFor={`punten-${team.id}`}>
                      Punten
                      <input
                        id={`punten-${team.id}`}
                        inputMode="decimal"
                        className="min-h-11 w-24 rounded-tegel border-[3px] border-studio bg-papier px-3 text-[17px] text-studio"
                        value={invoer[team.id] ?? (team.override !== null ? formatPoints(team.override) : "")}
                        onChange={(event) => setInvoer((oud) => ({ ...oud, [team.id]: event.target.value }))}
                      />
                    </label>
                    <Knop type="submit" size="klein" disabled={bezig}>
                      Bewaar
                    </Knop>
                    {team.override !== null ? (
                      <Knop type="button" size="klein" variant="secundair" disabled={bezig} onClick={() => void onBewaar(team.id, null)}>
                        Terug naar berekend
                      </Knop>
                    ) : null}
                  </form>
                </li>
              ))}
            </ul>
            <p className="m-0 text-label leading-[1.4] text-zand">
              {bijElkaar("Een correctie vervangt de punten van die vraag. De joker verdubbelt daarna nog steeds de hele ronde.")}
            </p>
          </>
        ) : null}
      </div>
    </details>
  );
}

function Jokers({ view, bezig, onZet }: { view: ConsoleView; bezig: boolean; onZet: (team: string, ronde: number | null) => Promise<void> }) {
  const [ronde, setRonde] = useState<Record<string, string>>({});
  return (
    <details className="rounded-kaart bg-studio-licht p-4">
      <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold leading-[44px]">Jokers</summary>
      <p className="m-0 mt-2 text-[14px] leading-[1.4] text-zand">
        {bijElkaar("Een captain zet de joker zelf in op het rondescherm. Hier draai je een vergissing terug, of zet je hem voor een team zonder telefoon.")}
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
        {view.teams.map((team) => (
          <li key={team.id} className="flex flex-wrap items-center gap-2 rounded-[16px] bg-studio px-3.5 py-2.5">
            <TeamVlak kleur={team.color} />
            <span className="min-w-[110px] flex-1 text-[15px] font-bold">
              {bijElkaar(`${korteNaam(team.name)}: ${team.jokerRound ? `ronde ${team.jokerRound}` : "nog niet"}`)}
            </span>
            {team.jokerRound ? (
              <Knop size="klein" variant="secundair" disabled={bezig} onClick={() => void onZet(team.id, null)}>
                Haal weg
              </Knop>
            ) : (
              <>
                <label className="sr-only" htmlFor={`joker-${team.id}`}>
                  Ronde voor {team.name}
                </label>
                <select
                  id={`joker-${team.id}`}
                  className="min-h-11 rounded-tegel border-[3px] border-studio bg-papier px-2 text-[15px] text-studio"
                  value={ronde[team.id] ?? String(view.round?.number ?? 1)}
                  onChange={(event) => setRonde((oud) => ({ ...oud, [team.id]: event.target.value }))}
                >
                  {(view.standings[0]?.rounds.map((r) => r.round) ?? [1, 2, 3, 4, 5]).map((nummer) => (
                    <option key={nummer} value={nummer}>
                      Ronde {nummer}
                    </option>
                  ))}
                </select>
                <Knop size="klein" disabled={bezig} onClick={() => void onZet(team.id, Number(ronde[team.id] ?? view.round?.number ?? 1))}>
                  <IconJoker size={18} />
                  Zet
                </Knop>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * "Nepteams antwoorden vanzelf" (test environment): while a question is
 * open, every test team without a captain device answers after a random
 * pause of 2 to 9 seconds. The server checks it all again.
 */
function Nepteams({ view }: { view: ConsoleView }) {
  const [aan, setAan] = useState(false);
  const vraag = view.phase === "open" ? view.question?.id : undefined;
  const nepteams = useRef<string[]>([]);
  useEffect(() => {
    nepteams.current = view.teams.filter((team) => !team.hasDevice && !team.answered).map((team) => team.id);
  });
  useEffect(() => {
    if (!aan || !vraag) return;
    // Once per question; the server skips teams that already answered.
    const timers = nepteams.current.map((team) => setTimeout(() => void stuur("/api/quiz/nepteams", { team }), 2000 + Math.random() * 7000));
    return () => timers.forEach(clearTimeout);
  }, [aan, vraag]);
  return (
    <Schakel
      aan={aan}
      label="Nepteams antwoorden vanzelf"
      uitleg="Proefteams zonder captaintoestel geven na een paar seconden een antwoord. Alleen in de proef."
      onWissel={() => setAan(!aan)}
    />
  );
}

function Pauze({ onPauze, bezig }: { onPauze: () => void; bezig: boolean }) {
  const [zeker, setZeker] = useState(false);
  return zeker ? (
    <div className="flex flex-wrap gap-2">
      <Knop variant="secundair" size="klein" disabled={bezig} onClick={onPauze}>
        Ja, zet de quiz op pauze
      </Knop>
      <Knop variant="tekst" size="klein" onClick={() => setZeker(false)}>
        Nee, ga door
      </Knop>
    </div>
  ) : (
    <Knop variant="tekst" className="self-start" onClick={() => setZeker(true)}>
      Zet de quiz op pauze
    </Knop>
  );
}
