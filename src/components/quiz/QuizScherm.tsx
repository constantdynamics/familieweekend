"use client";

import "./quiz.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Intermezzo } from "@/components/intermezzo/Intermezzo";
import { TeamVlak } from "@/components/team/TeamKleur";
import { IconJoker, IconVinkje } from "@/components/ui/icons";
import { IconLuidspreker, IconLuidsprekerUit, IconPersoon } from "@/components/ui/icons-quiz";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop, KnopLink } from "@/components/ui/Knop";
import { useLive } from "@/lib/client/live";
import type { Answer, QuizView, TeamColor, ViewTeam } from "@/lib/server/quiz/types";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { abonneerGeluid, bewaarGeluid, geluid, leesGeluid, stuur, useWakeLock } from "./hulp";
import { JokerStrook, korteNaam, LuisterGoed, QuizFotos, StandLijst } from "./onderdelen";
import type { Speld, TeamSpeld } from "./QuizKaart";
import { tegelKey, Tegels, tegelsVoor, type Tegel } from "./Tegels";
import { Toetsenbord, toonGetal } from "./Toetsenbord";

const QuizKaart = dynamic(() => import("./QuizKaart"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-kaart bg-studio-licht" aria-hidden="true" />,
});

const HEX: Record<TeamColor, { kleur: string; licht: boolean }> = {
  mosterd: { kleur: "#F5AE1B", licht: false },
  oranje: { kleur: "#F06A1F", licht: false },
  avocado: { kleur: "#6F7F1F", licht: true },
  petrol: { kleur: "#17565E", licht: true },
};

/**
 * Hides the menu while the quiz runs, from the very first paint. Next keeps
 * a page that was left mounted but hidden (display: none on its top), so
 * the rule only holds while the quiz screen itself is on show.
 */
const OVERNAME_CSS =
  'html:has([data-quiz-overname]):not(:has([style*="display: none"] [data-quiz-overname])) nav[aria-label="Hoofdmenu"]{display:none}';

/* A clock that ticks four times a second, only while "Nog 10 seconden!" runs. */
function abonneer(onChange: () => void) {
  const timer = setInterval(onChange, 250);
  return () => clearInterval(timer);
}
const stil = () => () => {};
const kwartTik = () => Math.floor(Date.now() / 250) * 250;

function puntenTekst(twelfths: number): string {
  const tekst = formatPoints(twelfths);
  return `${tekst} ${tekst === "1" ? "punt" : "punten"}`;
}

function afstand(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

/** Ends a sentence once: "Waar ligt Valkenburg?" gets no extra period. */
function zin(tekst: string): string {
  return /[.!?…]$/.test(tekst.trim()) ? tekst : `${tekst}.`;
}

/**
 * The quiz on a phone (SPEC §4.6): one screen per phase, for the captain
 * (who answers), meekijkers (who discuss) and visitors. It stays fresh
 * through the doorbell (useLive) and takes over the whole screen while the
 * quiz runs: the menu goes away.
 */
export function QuizScherm({ initial, kop, children }: { initial: QuizView; kop: ReactNode; children: ReactNode }) {
  const { data, error, updatedAt, refresh } = useLive<QuizView>("/api/quiz/state", initial);
  const view = data ?? initial;
  const loopt = view.status !== "rust";
  const captain = view.me.role === "captain";
  useWakeLock(captain && view.status === "quiz");

  // Sound is on by default only for captains; everyone can switch it.
  const voorkeur = useSyncExternalStore(abonneerGeluid, leesGeluid, () => null);
  const geluidAan = voorkeur === null ? captain : voorkeur;

  if (!loopt) {
    return (
      <>
        {kop}
        {view.phase !== null && view.phase !== "einde" ? (
          <div className="mt-4">
            <Melding tone="info">{bijElkaar("De quiz staat even op pauze. Zodra hij verder gaat, zie je het hier vanzelf.")}</Melding>
          </div>
        ) : null}
        {view.phase === "einde" && view.standings ? (
          <section aria-labelledby="eindstand-titel" className="mt-5 flex flex-col gap-3">
            <h2 id="eindstand-titel" className="m-0 text-[20px] leading-tight font-extrabold">
              Eindstand van de quiz
            </h2>
            <StandLijst rijen={view.standings} eigenTeam={view.me.team?.id} label="Eindstand van de quiz" />
          </section>
        ) : null}
        <div className="mt-4 empty:hidden">
          <CaptainHint view={view} />
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      {/* The quiz takes over the screen: no menu while it runs (SPEC §4). See quiz.css. */}
      <span data-quiz-overname="" hidden />
      <style>{OVERNAME_CSS}</style>
      <Aankondiging view={view} />
      <Kop view={view} />
      {view.me.captainTakenOver ? (
        <div className="mt-4 flex flex-col gap-1">
          <Melding tone="info">Je teamtoestel is overgenomen door een ander toestel.</Melding>
          <Link
            href="/captain?terug=/quiz"
            className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4"
          >
            Log opnieuw in als captain
          </Link>
        </div>
      ) : null}
      <JokerBanier jokers={view.jokers} />
      {error ? (
        <p role="status" className="m-0 mt-3 text-label text-zand">
          Even geen verbinding. De app probeert het steeds opnieuw.
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">
        {view.status === "intermezzo" ? (
          <Intermezzo />
        ) : view.phase === "rondescherm" ? (
          <RondeScherm view={view} onKlaar={refresh} />
        ) : view.phase === "open" || view.phase === "gesloten" || view.phase === "onthuld" ? (
          <VraagScherm key={view.question?.id ?? view.questionAt?.number ?? "vraag"} view={view} ontvangen={updatedAt} geluidAan={geluidAan} onKlaar={refresh} />
        ) : view.phase === "tussenstand" || view.phase === "einde" ? (
          <Stand view={view} />
        ) : null}
      </div>
      <Voet
        view={view}
        geluidAan={geluidAan}
        onGeluid={(aan) => {
          bewaarGeluid(aan);
          if (aan) geluid.wek();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------------ */

function rolTekst(view: QuizView): string {
  const team = view.me.team?.name;
  if (view.me.role === "captain" && team) return `Captain van ${team}`;
  if (team) return `${team}, je kijkt mee`;
  return "Je kijkt mee";
}

function Kop({ view }: { view: QuizView }) {
  const positie = view.round
    ? `Ronde ${view.round.index} van ${view.round.total}${view.questionAt ? `, vraag ${view.questionAt.number} van ${view.questionAt.count}` : ""}`
    : null;
  const titel = view.status === "intermezzo" ? "Intermezzo" : view.phase === "einde" ? "Einde van de quiz" : (view.round?.title ?? view.title ?? "De quiz");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-2 self-start rounded-pil bg-studio-licht py-1 pr-3 pl-1.5 text-label font-bold">
        {view.me.team ? <TeamVlak kleur={view.me.team.color} /> : <IconPersoon size={18} className="text-mosterd" />}
        {bijElkaar(rolTekst(view))}
      </span>
      {positie && view.status === "quiz" && view.phase !== "einde" ? <span className="text-[14px] text-zand">{bijElkaar(positie)}</span> : null}
      <h1 className="m-0 font-display text-[27px] leading-[1.15] font-normal schaduw-oranje">{bijElkaar(titel, 12)}</h1>
    </div>
  );
}

/** One sentence for screen readers whenever the quiz moves on (aria-live). */
function Aankondiging({ view }: { view: QuizView }) {
  let tekst = "";
  if (view.status === "intermezzo") tekst = "Het intermezzo begint: steen, papier, schaar.";
  else if (view.phase === "rondescherm" && view.round) tekst = zin(`Ronde ${view.round.index}: ${view.round.title}`);
  else if (view.phase === "open") tekst = view.luisterGoed ? `Vraag ${view.questionAt?.number ?? ""}: luister goed.` : `Vraag ${view.questionAt?.number ?? ""} staat open.`;
  else if (view.phase === "gesloten") tekst = "De vraag is gesloten.";
  else if (view.phase === "onthuld") tekst = "Het antwoord is onthuld.";
  else if (view.phase === "tussenstand" && view.round) tekst = `Tussenstand na ronde ${view.round.index}.`;
  else if (view.phase === "einde") tekst = "De quiz is klaar.";
  if (view.countdownMs !== null && view.countdownMs > 0) tekst = "Nog 10 seconden!";
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {tekst}
    </p>
  );
}

/** "Team Petrol speelt de joker in ronde 4!" on every phone, the moment it happens. */
function JokerBanier({ jokers }: { jokers: QuizView["jokers"] }) {
  const gezien = useRef<Set<string> | null>(null);
  const [nieuw, setNieuw] = useState<QuizView["jokers"]>([]);
  useEffect(() => {
    const sleutels = jokers.map((joker) => `${joker.teamId}:${joker.round}`);
    if (gezien.current === null) {
      gezien.current = new Set(sleutels);
      return;
    }
    const vers = jokers.filter((joker) => !gezien.current!.has(`${joker.teamId}:${joker.round}`));
    for (const key of sleutels) gezien.current.add(key);
    if (vers.length === 0) return;
    // Not cleared on the next fetch: the banner must still appear.
    setTimeout(() => setNieuw(vers), 0);
  }, [jokers]);
  // The banner is a moment: it goes away after seven seconds.
  useEffect(() => {
    if (nieuw.length === 0) return;
    const weg = setTimeout(() => setNieuw([]), 7000);
    return () => clearTimeout(weg);
  }, [nieuw]);
  if (nieuw.length === 0) return null;
  return (
    <div role="status" className="mt-4 flex flex-col gap-2">
      {nieuw.map((joker) => (
        <p
          key={`${joker.teamId}:${joker.round}`}
          className="quiz-banier m-0 flex items-center gap-3 rounded-kaart bg-mosterd px-4 py-3.5 text-[18px] leading-[1.3] font-extrabold text-studio shadow-kaart"
        >
          <IconJoker size={28} />
          <span>{bijElkaar(`${joker.name} speelt de joker in ronde ${joker.round}!`)}</span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Round screen: title, story, and the joker.                                */
/* ------------------------------------------------------------------------ */

function RondeScherm({ view, onKlaar }: { view: QuizView; onKlaar: () => void }) {
  const round = view.round;
  const [zeker, setZeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  if (!round) return null;
  const eigen = view.me.team ? view.jokers.find((joker) => joker.teamId === view.me.team?.id) : undefined;
  const hier = view.jokers.filter((joker) => joker.round === round.number);

  const speel = async () => {
    setBezig(true);
    setFout(null);
    const result = await stuur("/api/quiz/joker", { ronde: round.number });
    setBezig(false);
    setZeker(false);
    if (!result.ok) setFout(result.fout);
    onKlaar();
  };

  return (
    <>
      <Kaart className="flex flex-col gap-3">
        <p className="m-0 font-display text-[54px] leading-none font-normal text-oranje">{round.index}</p>
        {round.intro ? <p className="m-0 text-[17px] leading-[1.45]">{bijElkaar(round.intro)}</p> : null}
        <p className="m-0 text-[15px] font-bold">
          {bijElkaar(`${round.questionCount} ${round.questionCount === 1 ? "vraag" : "vragen"}${round.listeningRound ? ", met muziek: luister goed!" : ""}`)}
        </p>
      </Kaart>

      {hier.length > 0 ? (
        <JokerStrook>
          {bijElkaar(
            `${hier.length === 1 ? "Joker" : "Jokers"} in deze ronde: ${hier.map((joker) => korteNaam(joker.name)).join(", ")}`,
          )}
        </JokerStrook>
      ) : null}

      {view.me.role === "captain" && view.me.team ? (
        eigen ? (
          eigen.round === round.number ? null : (
            <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
              {bijElkaar(`Jullie joker staat al op ronde ${eigen.round}. Die kan maar één keer.`)}
            </p>
          )
        ) : view.me.canJoker ? (
          <section aria-labelledby="joker-titel" className="op-licht flex flex-col gap-3 rounded-kaart bg-mosterd p-[18px] text-studio shadow-kaart">
            <h2 id="joker-titel" className="m-0 flex items-center gap-2.5 text-[20px] leading-tight font-extrabold">
              <IconJoker size={26} />
              {bijElkaar("Speel je joker in deze ronde?")}
            </h2>
            <p className="m-0 text-[15px] leading-[1.45]">
              {bijElkaar("Alle punten van deze ronde tellen dan dubbel. Je joker kan maar één keer, in de hele quiz.")}
            </p>
            {zeker ? (
              <div className="flex flex-wrap gap-2">
                <Knop disabled={bezig} onClick={speel}>
                  {bezig ? "Bezig…" : "Ja, speel de joker"}
                </Knop>
                <Knop variant="secundair-licht" disabled={bezig} onClick={() => setZeker(false)}>
                  Nee, nog niet
                </Knop>
              </div>
            ) : (
              <Knop variant="secundair-licht" className="self-start" onClick={() => setZeker(true)}>
                {`Speel de joker in ronde ${round.index}`}
              </Knop>
            )}
          </section>
        ) : null
      ) : view.me.team ? (
        <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.4] text-zand">
          {eigen
            ? bijElkaar(`Jullie joker staat op ronde ${eigen.round}.`)
            : bijElkaar("Jullie captain kan nu de joker inzetten. Overleg gerust!")}
        </p>
      ) : null}
      {fout ? <Melding tone="fout">{bijElkaar(fout)}</Melding> : null}
      <p className="m-0 text-center text-[15px] text-zand">{bijElkaar("De eerste vraag komt zo.")}</p>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* A question: open, closed and revealed.                                    */
/* ------------------------------------------------------------------------ */

function VraagScherm({
  view,
  ontvangen,
  geluidAan,
  onKlaar,
}: {
  view: QuizView;
  ontvangen: number | null;
  geluidAan: boolean;
  onKlaar: () => void;
}) {
  const vraag = view.question;
  const [lokaal, setLokaal] = useState<Answer | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const nu = useSyncExternalStore(view.countdownMs !== null ? abonneer : stil, kwartTik, () => 0);

  const eindTijd = view.countdownMs !== null && ontvangen !== null ? ontvangen + view.countdownMs : null;
  const resterend = eindTijd !== null && nu > 0 ? Math.max(0, eindTijd - nu) : view.countdownMs;
  const tijdOm = view.phase === "open" && resterend !== null && resterend <= 0;
  const open = view.phase === "open" && !tijdOm;
  const onthuld = view.phase === "onthuld";
  const kiezen = view.me.canAnswer && open;
  const antwoord = lokaal ?? view.me.answer;
  const eigen = view.me.team ? view.teams.find((team) => team.id === view.me.team?.id) : undefined;
  const jokerHier = eigen?.jokerRound !== null && eigen?.jokerRound === view.round?.number;

  // Tick in the last seconds, "ding" when the team was right.
  const vorigeSeconde = useRef<number | null>(null);
  useEffect(() => {
    if (!geluidAan || resterend === null || !open) return;
    const seconde = Math.ceil(resterend / 1000);
    if (seconde !== vorigeSeconde.current && seconde > 0) geluid.tik();
    vorigeSeconde.current = seconde;
  }, [geluidAan, resterend, open]);
  const goedGemeld = useRef(false);
  useEffect(() => {
    if (onthuld && geluidAan && eigen?.result?.correct && !goedGemeld.current) {
      goedGemeld.current = true;
      geluid.ding();
    }
  }, [onthuld, geluidAan, eigen?.result?.correct]);

  const verstuur = async (nieuw: Answer) => {
    geluid.wek();
    setLokaal(nieuw);
    setBezig(true);
    setFout(null);
    const result = await stuur("/api/quiz/antwoord", { vraag: vraag?.id, antwoord: nieuw });
    setBezig(false);
    if (!result.ok) {
      setLokaal(null);
      setFout(result.fout);
    }
    onKlaar();
  };

  if (view.luisterGoed) {
    return (
      <>
        {resterend !== null && view.phase === "open" ? <Aftellen ms={resterend} /> : null}
        {jokerHier ? <JokerStrook>Joker ingezet: deze ronde telt dubbel</JokerStrook> : null}
        <LuisterGoed />
        <MeekijkInfo view={view} />
      </>
    );
  }
  if (!vraag) return null;

  const tegels = tegelsVoor(vraag.kind, vraag.options);
  const goedKey = onthuld && tegels ? tegelKey(vraag.kind, vraag.correct) : null;
  const hulp = onthuld
    ? null
    : !open
      ? "De vraag is gesloten. Even wachten op het antwoord…"
      : view.me.role === "captain"
        ? antwoord
          ? "Gekozen. Wijzigen kan tot de quizmaster de vraag sluit."
          : vraag.kind === "kaart"
            ? "Schuif de kaart tot de speld op de goede plek staat."
            : vraag.kind === "schatting"
              ? "Overleg met je team en typ jullie schatting."
              : "Overleg met je team en tik op een antwoord."
        : null;

  return (
    <>
      {resterend !== null && view.phase === "open" ? <Aftellen ms={resterend} /> : null}
      {jokerHier ? <JokerStrook>Joker ingezet: deze ronde telt dubbel</JokerStrook> : null}
      {vraag.photoUrl ? (
        <QuizFotos
          srcs={[vraag.photoUrl, ...(vraag.extraPhotoUrls ?? [])]}
          alt={`Foto bij vraag ${vraag.number}`}
          onderschrift={vraag.submitter ? `Ingezonden door ${vraag.submitter}` : vraag.photoCredit}
        />
      ) : null}
      <Kaart className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[22px] leading-[1.25] font-extrabold">{bijElkaar(vraag.text)}</h2>
        {hulp ? <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(hulp)}</p> : null}
        {onthuld && vraag.explanation ? <p className="m-0 text-[16px] leading-[1.45] font-semibold">{bijElkaar(vraag.explanation)}</p> : null}
      </Kaart>

      {onthuld ? <Uitslag view={view} /> : null}

      {tegels ? (
        <Tegels
          tegels={tegels}
          gekozen={tegelKey(vraag.kind, antwoord)}
          goed={goedKey}
          modus={kiezen ? "kies" : "kijk"}
          bezig={bezig}
          keuzeLabel={view.me.role === "captain" ? "Jouw keuze" : "Jullie keuze"}
          onKies={(tegel: Tegel) => void verstuur(tegel.antwoord)}
        />
      ) : vraag.kind === "schatting" ? (
        <Schatting view={view} antwoord={antwoord} kiezen={kiezen} bezig={bezig} onVerstuur={(value) => void verstuur({ number: value })} />
      ) : vraag.kind === "kaart" ? (
        <KaartVraag view={view} antwoord={antwoord} kiezen={kiezen} bezig={bezig} onZet={(speld) => void verstuur(speld)} />
      ) : null}

      {fout ? <Melding tone="fout">{bijElkaar(fout)}</Melding> : null}
      {view.me.role === "captain" ? null : <MeekijkInfo view={view} />}
      <TeamStatus view={view} />
    </>
  );
}

function Aftellen({ ms }: { ms: number }) {
  const seconden = Math.ceil(ms / 1000);
  return (
    <p className="quiz-plof m-0 flex items-center justify-center gap-3 rounded-pil bg-roest px-5 py-2.5 text-[18px] font-extrabold text-beeldbuis" aria-hidden="true">
      {seconden > 0 ? (
        <>
          Nog <span className="font-display text-[30px] leading-none font-normal cijfers">{seconden}</span> {seconden === 1 ? "seconde" : "seconden"}!
        </>
      ) : (
        "De tijd is om!"
      )}
    </p>
  );
}

/** Right or wrong for this team, with the points (joker included). */
function Uitslag({ view }: { view: QuizView }) {
  const vraag = view.question;
  const eigen = view.me.team ? view.teams.find((team) => team.id === view.me.team?.id) : undefined;
  if (!vraag || !eigen?.result) return null;
  const result = eigen.result;
  const joker = result.twelfthsWithJoker !== result.twelfths;
  const punten = puntenTekst(result.twelfths);
  let tekst: string;
  if (result.twelfths > 0) {
    const basis =
      vraag.kind === "kaart" && result.distanceKm !== null
        ? `Goed! ${afstand(result.distanceKm)} ernaast: +${punten}.`
        : vraag.kind === "schatting"
          ? `Goed! Jullie zaten er het dichtst bij: +${punten}.`
          : `Goed! +${punten}.`;
    tekst = joker ? `${basis.slice(0, -1)}, met de joker zelfs +${formatPoints(result.twelfthsWithJoker)}.` : basis;
  } else if (!result.answer) {
    tekst = "Jullie hadden geen antwoord gegeven. Volgende keer beter!";
  } else if (vraag.kind === "kaart" && result.distanceKm !== null) {
    tekst = `${afstand(result.distanceKm)} ernaast: helaas geen punten.`;
  } else if (vraag.kind === "schatting") {
    tekst = "Helaas, een ander team zat dichterbij.";
  } else {
    tekst = "Helaas, dat was niet goed.";
  }
  if (result.corrected) tekst += " De quizmaster heeft de punten aangepast.";
  return (
    <p
      className={`quiz-plof m-0 rounded-[18px] px-4 py-3 text-[17px] leading-[1.35] font-extrabold ${
        result.twelfths > 0 ? "bg-avocado-licht text-studio" : "bg-roest text-beeldbuis"
      }`}
    >
      {bijElkaar(tekst)}
    </p>
  );
}

function Schatting({
  view,
  antwoord,
  kiezen,
  bezig,
  onVerstuur,
}: {
  view: QuizView;
  antwoord: Answer | null;
  kiezen: boolean;
  bezig: boolean;
  onVerstuur: (value: number) => void;
}) {
  const vraag = view.question!;
  const eigenGetal = antwoord && "number" in antwoord ? antwoord.number : null;
  const eenheid = vraag.unit ? ` ${vraag.unit}` : "";
  if (view.phase === "onthuld") {
    const goed = typeof vraag.correct === "number" ? vraag.correct : null;
    const met = view.teams.filter((team) => team.result?.answer && "number" in team.result.answer);
    return (
      <section aria-labelledby="schatting-uitslag" className="flex flex-col gap-2.5">
        <h3 id="schatting-uitslag" className="m-0 text-[17px] font-extrabold">
          {goed !== null ? bijElkaar(`Het goede antwoord: ${toonGetal(goed)}${eenheid}`) : "Het goede antwoord"}
        </h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {met.map((team) => {
            const getal = (team.result!.answer as { number: number }).number;
            return (
              <li key={team.id} className="flex items-center gap-3 rounded-[16px] bg-studio-licht px-4 py-2.5">
                <TeamVlak kleur={team.color} />
                <span className="flex-1 text-[16px] font-bold">{bijElkaar(korteNaam(team.name))}</span>
                <span className="text-[16px] font-extrabold cijfers">
                  {toonGetal(getal)}
                  {eenheid}
                </span>
                {team.result!.twelfths > 0 ? <IconVinkje size={20} className="text-avocado-licht" /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  if (kiezen) return <Toetsenbord eenheid={vraag.unit} verstuurd={eigenGetal} bezig={bezig} onVerstuur={onVerstuur} />;
  if (view.me.role === "captain" && eigenGetal !== null) {
    return (
      <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[16px] font-bold">
        {bijElkaar(`Jullie schatting: ${toonGetal(eigenGetal)}${eenheid}`)}
      </p>
    );
  }
  return null;
}

function KaartVraag({
  view,
  antwoord,
  kiezen,
  bezig,
  onZet,
}: {
  view: QuizView;
  antwoord: Answer | null;
  kiezen: boolean;
  bezig: boolean;
  onZet: (speld: Speld) => void;
}) {
  const vraag = view.question!;
  const schaal = vraag.scale ?? "nederland";
  const mijn = antwoord && "lat" in antwoord ? { lat: antwoord.lat, lng: antwoord.lng } : null;
  if (view.phase === "onthuld") {
    const spelden: TeamSpeld[] = view.teams.flatMap((team) =>
      team.result?.answer && "lat" in team.result.answer
        ? [{ id: team.id, naam: team.name, lat: team.result.answer.lat, lng: team.result.answer.lng, ...HEX[team.color] }]
        : [],
    );
    const goed = vraag.correct && typeof vraag.correct === "object" ? (vraag.correct as Speld) : null;
    return (
      <>
        <QuizKaart schaal={schaal} modus="onthul" mijnSpeld={null} spelden={spelden} goed={goed} />
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Spelden van de teams">
          {view.teams.map((team) => (
            <li key={team.id} className="flex items-center gap-3 rounded-[16px] bg-studio-licht px-4 py-2.5">
              <TeamVlak kleur={team.color} />
              <span className="flex-1 text-[16px] font-bold">{bijElkaar(korteNaam(team.name))}</span>
              <span className="text-[15px] font-semibold cijfers">
                {team.result?.distanceKm !== null && team.result?.distanceKm !== undefined
                  ? bijElkaar(`${afstand(team.result.distanceKm)}, ${puntenTekst(team.result.twelfths)}`)
                  : "geen speld"}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <>
      <QuizKaart schaal={schaal} modus={kiezen ? "kies" : "kijk"} mijnSpeld={view.me.role === "captain" ? mijn : null} onZet={onZet} bezig={bezig} />
      {view.me.role === "captain" && mijn && !kiezen ? (
        <p className="m-0 text-[15px] text-zand">{bijElkaar("Jullie speld staat op de kaart.")}</p>
      ) : null}
    </>
  );
}

/** For meekijkers: only the captain answers, and whether the captain chose already. */
function MeekijkInfo({ view }: { view: QuizView }) {
  const team = view.me.team;
  const naam = view.me.captainName ?? "Jullie captain";
  // After the reveal the result above says it all.
  if (team && view.phase === "onthuld") return null;
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-studio-licht px-4 py-3.5" aria-label="Meekijken">
      {team ? (
        <>
          <p className="m-0 flex items-center gap-2.5 text-[15px] leading-[1.35]">
            <IconPersoon size={22} className="flex-none text-mosterd" />
            <span>{bijElkaar("Alleen jullie captain kan antwoorden. Overleg gerust!")}</span>
          </p>
          {view.phase !== "onthuld" ? (
            <p className="m-0 flex items-center gap-2.5 text-[15px] leading-[1.35] font-bold">
              {view.me.teamAnswered ? <IconVinkje size={22} className="flex-none text-avocado-licht" /> : <span className="w-[22px] flex-none" aria-hidden="true" />}
              <span>
                {bijElkaar(
                  view.me.teamAnswered
                    ? view.phase === "open"
                      ? `${naam} heeft gekozen, wijzigen kan nog`
                      : `${naam} heeft gekozen`
                    : `${naam} denkt nog na`,
                )}
              </span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="m-0 flex items-center gap-2.5 text-[15px] leading-[1.35]">
          <IconPersoon size={22} className="flex-none text-mosterd" />
          <span>{bijElkaar("Je zit niet in een team, dus je kijkt lekker mee.")}</span>
        </p>
      )}
    </section>
  );
}

/** The status of one team, under its name: answered, "denkt na", or the points. */
function TeamStatusTeken({ team, view }: { team: ViewTeam; view: QuizView }) {
  if (view.phase === "onthuld" && team.result) {
    const punten = team.result.twelfthsWithJoker;
    const joker = punten !== team.result.twelfths;
    return (
      <span className={`flex items-center gap-1 text-[14px] font-extrabold whitespace-nowrap cijfers ${punten > 0 ? "text-avocado-licht" : "text-zand"}`}>
        {punten > 0 ? `+${puntenTekst(punten)}` : "0 punten"}
        {joker ? (
          <>
            <IconJoker size={16} className="text-mosterd" />
            <span className="sr-only">met joker</span>
          </>
        ) : null}
      </span>
    );
  }
  if (team.answered) {
    return (
      <span className="flex items-center gap-1 text-[14px] font-bold whitespace-nowrap text-avocado-licht">
        <IconVinkje size={16} />
        geantwoord
      </span>
    );
  }
  return <span className="text-[14px] font-medium whitespace-nowrap text-zand">{view.phase === "open" ? "denkt na" : "te laat"}</span>;
}

/** "3 van 4 teams hebben geantwoord", with a block per team. */
function TeamStatus({ view }: { view: QuizView }) {
  const totaal = view.teams.length;
  return (
    <section aria-labelledby="teams-status" className="flex flex-col gap-2">
      <h2 id="teams-status" className="m-0 text-[14px] font-bold text-zand" aria-live="polite">
        {view.phase === "onthuld"
          ? "Punten per team"
          : bijElkaar(`${view.answeredCount} van ${totaal} ${totaal === 1 ? "team" : "teams"} ${view.answeredCount === 1 ? "heeft" : "hebben"} geantwoord`)}
      </h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {view.teams.map((team) => {
          const eigen = team.id === view.me.team?.id;
          return (
            <li
              key={team.id}
              className={`flex min-h-[52px] items-center gap-2.5 rounded-[18px] bg-studio-licht px-3 py-2 ${eigen ? "ring-2 ring-beeldbuis" : ""}`}
            >
              <TeamVlak kleur={team.color} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] leading-tight font-bold">
                  {korteNaam(team.name)}
                  {eigen ? <span className="sr-only"> (jullie team)</span> : null}
                </span>
                <TeamStatusTeken team={team} view={view} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Interim standing and the end.                                             */
/* ------------------------------------------------------------------------ */

function Stand({ view }: { view: QuizView }) {
  const titel = view.phase === "einde" ? "Eindstand van de quiz" : `Tussenstand na ronde ${view.round?.index ?? ""}`;
  return (
    <>
      <h2 className="m-0 text-[20px] font-extrabold">{bijElkaar(titel)}</h2>
      {view.standingsHidden ? (
        <Melding tone="info">Het scorebord is op slot tot de prijsuitreiking. De stand blijft dus nog even geheim.</Melding>
      ) : view.standings ? (
        <StandLijst rijen={view.standings} eigenTeam={view.me.team?.id} label={titel} />
      ) : null}
      {view.phase === "tussenstand" && view.nextRound ? (
        <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[16px] leading-[1.4]">
          {view.nextRound.intermezzoFirst
            ? bijElkaar(zin(`Eerst het intermezzo: steen, papier, schaar! Daarna ronde ${view.round ? view.round.index + 1 : ""}, ${view.nextRound.title}`))
            : bijElkaar(zin(`Hierna: ronde ${view.round ? view.round.index + 1 : ""}, ${view.nextRound.title}`))}
        </p>
      ) : null}
      {view.phase === "einde" ? (
        <p className="m-0 text-[16px] leading-[1.45] text-zand">
          {bijElkaar("Dat was de quiz! De punten tellen mee voor het klassement van de Spelen.")}
        </p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Captain login, takeover and sound.                                        */
/* ------------------------------------------------------------------------ */

function CaptainHint({ view }: { view: QuizView }) {
  if (view.me.role === "captain") return null;
  if (view.me.captainTakenOver) {
    return (
      <div className="flex flex-col gap-2">
        <Melding tone="info">Je teamtoestel is overgenomen door een ander toestel.</Melding>
        <Link href="/captain?terug=/quiz" className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4">
          Log opnieuw in als captain
        </Link>
      </div>
    );
  }
  if (!view.me.suggestCaptainLogin) return null;
  return (
    <Kaart className="flex flex-col gap-2.5">
      <h2 className="m-0 text-[19px] leading-tight font-extrabold">{bijElkaar("Jij bent captain!")}</h2>
      <p className="m-0 text-[15px] leading-[1.45]">
        {bijElkaar("Log in met de team-PIN, dan wordt deze telefoon het teamtoestel. Alleen daarop kun je antwoorden.")}
      </p>
      <KnopLink href="/captain?terug=/quiz" className="self-start">
        Log in als captain
      </KnopLink>
    </Kaart>
  );
}

function Voet({ view, geluidAan, onGeluid }: { view: QuizView; geluidAan: boolean; onGeluid: (aan: boolean) => void }) {
  return (
    <div className="mt-7 flex flex-col items-start gap-3">
      {view.me.role !== "captain" && !view.me.captainTakenOver ? <CaptainHint view={view} /> : null}
      {view.me.role !== "captain" && view.me.team && !view.me.suggestCaptainLogin && !view.me.captainTakenOver ? (
        <Link href="/captain?terug=/quiz" className="inline-flex min-h-11 items-center text-[15px] text-zand underline underline-offset-4">
          Ben jij de captain? Log hier in
        </Link>
      ) : null}
      <button
        type="button"
        aria-pressed={geluidAan}
        onClick={() => onGeluid(!geluidAan)}
        className="inline-flex min-h-11 items-center gap-2 rounded-pil border-2 border-zand px-4 text-[15px] font-bold text-beeldbuis"
      >
        {geluidAan ? <IconLuidspreker size={20} /> : <IconLuidsprekerUit size={20} />}
        {geluidAan ? "Geluid staat aan" : "Geluid staat uit"}
      </button>
    </div>
  );
}
