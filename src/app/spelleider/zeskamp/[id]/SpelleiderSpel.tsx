"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Punten, TeamBalk } from "@/components/score/Punten";
import { TEAM_KLEUREN } from "@/components/team/TeamKleur";
import { IconJoker, IconMin, IconPijlTerug, IconPlus, IconVinkje, IconWifiUit } from "@/components/ui/icons";
import { Chip, Melding, Paneel } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { useLive } from "@/lib/client/live";
import { enqueue, forgetEvent, newClientId, useWachtrij, type QueueItem } from "@/lib/client/offline-uitslagen";
import type { PlacementView, StaffGameView } from "@/lib/server/zeskamp";
import { formatPoints, type Placement } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import { formatTime } from "@/lib/shared/time";
import {
  checkResultValue,
  formatDecimal,
  formatSeconds,
  formatStopwatch,
  isCountType,
  isMeasureType,
  MODE_LABELS,
  parseDecimal,
  placeText,
  pointsRule,
  rankGame,
  RESULT_TYPE_LABELS,
  stopwatchSeconds,
  type ResultType,
} from "@/lib/shared/zeskamp";

/**
 * The spelleider screen of one game (SPEC §4.9): a stopwatch (all teams at
 * once, or one after the other), counters, measurements, jury marks or the
 * finishing order; places and points live; and "Verstuur uitslag" through
 * the offline queue. What is entered stays on the phone until it is sent,
 * also when the page is reloaded.
 */

type Team = StaffGameView["teams"][number];

type Draft = {
  versie: 1;
  gestart: boolean;
  /** Date.now() at the start of the shared stopwatch. */
  startEpoch: number | null;
  /** Seconds per team (hundredths). */
  tijden: Record<string, number>;
  /** One after the other: Date.now() at the start of a team that is running. */
  lopend: Record<string, number>;
  aantallen: Record<string, number>;
  teksten: Record<string, string>;
  plaatsen: Record<string, number>;
  verstuurdId: string | null;
  verstuurd: Record<string, number> | null;
};

const LEEG: Draft = {
  versie: 1,
  gestart: false,
  startEpoch: null,
  tijden: {},
  lopend: {},
  aantallen: {},
  teksten: {},
  plaatsen: {},
  verstuurdId: null,
  verstuurd: null,
};

function laad(key: string): Draft {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const draft = JSON.parse(raw) as Partial<Draft>;
      if (draft?.versie === 1) return { ...LEEG, ...draft };
    }
  } catch {
    // Nothing stored, or no storage: start empty.
  }
  return LEEG;
}

/**
 * Both clocks at once, for event handlers and effects only: performance.now()
 * measures (monotonic, sub-millisecond), Date.now() survives a reload.
 */
function klok(): { perf: number; epoch: number } {
  return { perf: performance.now(), epoch: Date.now() };
}

function trillen() {
  try {
    navigator.vibrate?.(35);
  } catch {
    // Not every phone can.
  }
}

/** Keep the screen on while a game runs (Screen Wake Lock), where the phone allows it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (stopped) void lock.release().catch(() => undefined);
      } catch {
        // Not allowed (battery saver, background tab): the screen may dim.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Milliseconds since `since` (Date.now() based), refreshed every frame while `running`. */
function useLopend(since: number | null, running: boolean): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (since === null || !running) return;
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [since, running]);
  if (since === null || now === null) return 0;
  return Math.max(0, now - since);
}

const noSubscribe = () => () => undefined;

export function SpelleiderSpel({ initial, env, rol }: { initial: StaffGameView; env: "live" | "test"; rol: "beheerder" | "spelleider" }) {
  const live = useLive<StaffGameView>(`/api/zeskamp/${initial.game.id}`, initial);
  const view = live.data ?? initial;
  const client = useSyncExternalStore(noSubscribe, () => true, () => false);
  const type = view.game.resultType;

  return (
    <>
      <Kop view={view} rol={rol} />
      {type === null ? (
        <div className="mt-5">
          <Melding tone="info">{bijElkaar("Dit spel heeft nog geen uitslagtype. Vraag de beheerder om het in te stellen.")}</Melding>
        </div>
      ) : client ? (
        <Invoer view={view} env={env} type={type} herlaad={live.refresh} />
      ) : (
        <div aria-busy="true" className="mt-5 h-72 rounded-kaart bg-studio-licht">
          <span className="sr-only">Laden…</span>
        </div>
      )}
      {type ? <p className="m-0 mt-5 text-[14px] leading-[1.45] text-zand">{bijElkaar(pointsRule(view.game.pointsTable, type))}</p> : null}
    </>
  );
}

function teamNamen(teams: readonly Team[]): string {
  const names = teams.map((team) => team.name);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
}

function Kop({ view, rol }: { view: StaffGameView; rol: "beheerder" | "spelleider" }) {
  const { game, jokers } = view;
  return (
    <>
      <Link
        href="/spelleider/zeskamp"
        className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 self-start pr-2 text-[15px] font-bold text-zand no-underline hover:text-beeldbuis"
      >
        <IconPijlTerug size={20} />
        Alle spellen
      </Link>
      <div className="flex flex-col gap-1.5 pr-10">
        <Chip>{rol === "beheerder" ? "Beheerder" : "Spelleider"}</Chip>
        <p className="m-0 text-[14px] text-zand">
          Spel {game.number} van {game.total}
        </p>
        <h1 className="m-0 font-display text-[30px] leading-[1.1] font-normal schaduw-oranje">{bijElkaar(game.name)}</h1>
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {game.resultType ? (
          <li className="rounded-pil bg-studio-licht px-3 py-1.5 text-[14px] font-bold">{RESULT_TYPE_LABELS[game.resultType]}</li>
        ) : null}
        <li className="rounded-pil bg-studio-licht px-3 py-1.5 text-[14px] font-bold">{MODE_LABELS[game.mode]}</li>
        {jokers.length > 0 ? (
          <li className="inline-flex items-center gap-1.5 rounded-pil bg-mosterd px-3 py-1.5 text-[14px] font-extrabold text-studio">
            <IconJoker size={16} />
            {bijElkaar(`Joker: ${teamNamen(jokers)}`)}
          </li>
        ) : null}
      </ul>
      {game.description ? <p className="m-0 mt-3 text-[15px] leading-[1.45] text-zand">{bijElkaar(game.description)}</p> : null}
    </>
  );
}

function waarden(type: ResultType, teams: readonly Team[], draft: Draft): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const team of teams) {
    if (type === "tijd") out[team.id] = draft.tijden[team.id] ?? null;
    else if (isCountType(type)) out[team.id] = draft.gestart ? (draft.aantallen[team.id] ?? 0) : null;
    else if (type === "plaatsen") out[team.id] = draft.plaatsen[team.id] ?? null;
    else out[team.id] = parseDecimal(draft.teksten[team.id] ?? "");
  }
  return out;
}

function puntenTekst(placement: Placement | undefined): string {
  if (!placement || placement.place === null) return "";
  const punten = formatPoints(placement.twelfths);
  return `${placeText(placement.place)}${placement.shared ? " gedeeld" : ""}, ${punten} ${placement.twelfths === 12 ? "punt" : "punten"}${placement.joker ? " met joker" : ""}`;
}

function Invoer({
  view,
  env,
  type,
  herlaad,
}: {
  view: StaffGameView;
  env: "live" | "test";
  type: ResultType;
  herlaad: () => void;
}) {
  const { game, teams } = view;
  const key = `valk-spel-${env}-${game.id}`;
  const [draft, setDraft] = useState<Draft>(() => laad(key));
  const [bevestig, setBevestig] = useState(false);
  const [laatste, setLaatste] = useState<string | null>(null);
  const [gelijk, setGelijk] = useState(false);
  const perfStart = useRef<number | null>(null);
  const perfRuns = useRef<Record<string, number>>({});
  const { items, geladen } = useWachtrij(game.id);

  // After a reload the stopwatch goes on from the stored start.
  useEffect(() => {
    const now = klok();
    if (draft.startEpoch !== null && perfStart.current === null) {
      perfStart.current = now.perf - (now.epoch - draft.startEpoch);
    }
    for (const [team, epoch] of Object.entries(draft.lopend)) {
      if (perfRuns.current[team] === undefined) perfRuns.current[team] = now.perf - (now.epoch - epoch);
    }
  }, [draft.startEpoch, draft.lopend]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // No storage: it stays on screen until the page closes.
    }
  }, [key, draft]);

  const sent: QueueItem | null = draft.verstuurdId ? (items.find((item) => item.id === draft.verstuurdId) ?? null) : null;
  const sentStatus = sent?.status ?? (draft.verstuurdId ? (game.status === "klaar" ? "verstuurd" : "wacht") : null);

  // The draft on this phone is a second copy: if the queue lost the result
  // (no IndexedDB in this browser, say), it goes in again with the same id.
  useEffect(() => {
    const id = draft.verstuurdId;
    const values = draft.verstuurd;
    if (!geladen || !id || !values || game.status === "klaar" || items.some((item) => item.id === id)) return;
    void enqueue({
      id,
      kind: "uitslag",
      eventId: game.id,
      env,
      body: { clientId: id, values: teams.map((team) => ({ teamId: team.id, value: values[team.id] })) },
    });
  }, [geladen, items, draft.verstuurdId, draft.verstuurd, game.status, game.id, env, teams]);

  // Once the result is in, fetch the game again (status "klaar").
  useEffect(() => {
    if (sentStatus === "verstuurd") herlaad();
  }, [sentStatus, herlaad]);

  useWakeLock(draft.gestart && !draft.verstuurdId);

  const jokerIds = view.jokers.map((team) => team.id);
  const values = draft.verstuurd ?? waarden(type, teams, draft);
  const placements = rankGame(
    teams.map((team) => ({ team: team.id, value: values[team.id] ?? null })),
    type,
    game.pointsTable,
    jokerIds,
  );
  const perTeam = new Map(placements.map((row) => [row.team, row]));
  const complete = teams.every((team) => {
    const value = values[team.id];
    return value !== null && value !== undefined && checkResultValue(type, value, teams.length) === null;
  });
  const vast = draft.verstuurdId !== null;

  const meldStart = () => {
    if (game.status === "gepland") void enqueue({ id: newClientId(), kind: "start", eventId: game.id, env, body: {} });
  };

  const startTijd = () => {
    trillen();
    const now = klok();
    perfStart.current = now.perf;
    setDraft((d) => ({ ...d, gestart: true, startEpoch: now.epoch, tijden: {} }));
    setLaatste(null);
    meldStart();
  };

  const startSpel = () => {
    trillen();
    const { epoch } = klok();
    setDraft((d) => ({ ...d, gestart: true, startEpoch: d.startEpoch ?? epoch }));
    meldStart();
  };

  const stop = (teamId: string) => {
    if (perfStart.current === null || draft.tijden[teamId] !== undefined || vast) return;
    const seconds = stopwatchSeconds(klok().perf - perfStart.current);
    trillen();
    setDraft((d) => (d.tijden[teamId] !== undefined ? d : { ...d, tijden: { ...d.tijden, [teamId]: seconds } }));
    setLaatste(teamId);
  };

  const herstel = (teamId: string) => {
    setDraft((d) => {
      const tijden = { ...d.tijden };
      delete tijden[teamId];
      return { ...d, tijden };
    });
    setLaatste(null);
  };

  const startTeam = (teamId: string) => {
    trillen();
    const { perf, epoch } = klok();
    perfRuns.current[teamId] = perf;
    setDraft((d) => {
      const tijden = { ...d.tijden };
      delete tijden[teamId];
      return { ...d, gestart: true, startEpoch: d.startEpoch ?? epoch, tijden, lopend: { ...d.lopend, [teamId]: epoch } };
    });
    meldStart();
  };

  const stopTeam = (teamId: string) => {
    const begin = perfRuns.current[teamId];
    if (begin === undefined) return;
    const seconds = stopwatchSeconds(klok().perf - begin);
    delete perfRuns.current[teamId];
    trillen();
    setDraft((d) => {
      const lopend = { ...d.lopend };
      delete lopend[teamId];
      return { ...d, lopend, tijden: { ...d.tijden, [teamId]: seconds } };
    });
  };

  const tel = (teamId: string, delta: number) =>
    setDraft((d) => ({ ...d, aantallen: { ...d.aantallen, [teamId]: Math.max(0, (d.aantallen[teamId] ?? 0) + delta) } }));

  const typ = (teamId: string, text: string) => setDraft((d) => ({ ...d, teksten: { ...d.teksten, [teamId]: text } }));

  const tik = (teamId: string) => {
    setDraft((d) => {
      if (d.plaatsen[teamId] !== undefined) return d;
      const taken = Object.values(d.plaatsen);
      const place = gelijk && taken.length > 0 ? Math.max(...taken) : taken.length + 1;
      return { ...d, plaatsen: { ...d.plaatsen, [teamId]: place } };
    });
    setGelijk(false);
    trillen();
  };

  const opnieuw = () => {
    if (!bevestig) {
      setBevestig(true);
      return;
    }
    perfStart.current = null;
    perfRuns.current = {};
    setDraft((d) => ({ ...LEEG, gestart: d.gestart && type !== "tijd", startEpoch: type !== "tijd" ? d.startEpoch : null }));
    setBevestig(false);
    setLaatste(null);
  };

  const verstuur = () => {
    if (!complete || vast) return;
    const id = newClientId();
    const sentValues = Object.fromEntries(teams.map((team) => [team.id, values[team.id] as number]));
    setDraft((d) => ({ ...d, verstuurdId: id, verstuurd: sentValues, lopend: {} }));
    void enqueue({
      id,
      kind: "uitslag",
      eventId: game.id,
      env,
      body: { clientId: id, values: teams.map((team) => ({ teamId: team.id, value: sentValues[team.id] })) },
    });
  };

  const beginOpnieuw = () => {
    perfStart.current = null;
    perfRuns.current = {};
    setDraft(LEEG);
    void forgetEvent(game.id);
  };

  // Somebody else already entered this game: no second result from here.
  if (game.status === "klaar" && !draft.verstuurdId) return <AlKlaar view={view} />;

  // The admin reset the game after this phone sent its result.
  if (draft.verstuurdId && sentStatus === "verstuurd" && game.status === "gepland" && !view.entered) {
    return (
      <div className="mt-5 flex flex-col gap-3">
        <Melding tone="info">{bijElkaar("De beheerder heeft dit spel teruggezet. Je kunt het opnieuw spelen.")}</Melding>
        <Knop onClick={beginOpnieuw}>Begin opnieuw</Knop>
      </div>
    );
  }

  const tegelijk = type === "tijd" && game.mode === "tegelijk";
  const allesBinnen = type === "tijd" && teams.every((team) => draft.tijden[team.id] !== undefined);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {tegelijk ? (
        <>
          <Paneel className="flex flex-col items-center gap-1">
            <Stopwatch
              startEpoch={draft.startEpoch}
              klaarMs={allesBinnen ? Math.max(...teams.map((team) => draft.tijden[team.id] ?? 0)) * 1000 : null}
            />
            <p aria-live="polite" className="m-0 text-[14px] text-zand">
              {!draft.gestart
                ? "Klaar voor de start"
                : allesBinnen
                  ? vast
                    ? "Alle teams binnen"
                    : "Alle teams binnen, controleer en verstuur"
                  : `${teams.filter((team) => draft.tijden[team.id] === undefined).length} van ${teams.length} teams nog onderweg`}
            </p>
          </Paneel>
          {!draft.gestart ? (
            <Knop size="groot" className="min-h-16 text-[20px]" onClick={startTijd}>
              Start de tijd
            </Knop>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            {teams.map((team) => (
              <StopKnop
                key={team.id}
                team={team}
                tijd={draft.tijden[team.id] ?? null}
                gestart={draft.gestart}
                joker={jokerIds.includes(team.id)}
                placement={perTeam.get(team.id)}
                disabled={!draft.gestart || vast || draft.tijden[team.id] !== undefined}
                onStop={() => stop(team.id)}
              />
            ))}
          </div>
          {laatste && !vast && draft.tijden[laatste] !== undefined ? (
            <p className="m-0 flex items-center gap-2 text-[15px]">
              <span className="min-w-0 flex-1">
                Laatst gestopt: {teams.find((team) => team.id === laatste)?.name}.
              </span>
              <button
                type="button"
                className="min-h-11 font-bold text-mosterd underline underline-offset-4"
                onClick={() => herstel(laatste)}
              >
                Herstel
              </button>
            </p>
          ) : null}
        </>
      ) : type === "tijd" ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {teams.map((team) => (
            <NaElkaarRij
              key={team.id}
              team={team}
              tijd={draft.tijden[team.id] ?? null}
              lopendSinds={draft.lopend[team.id] ?? null}
              joker={jokerIds.includes(team.id)}
              placement={perTeam.get(team.id)}
              vast={vast}
              onStart={() => startTeam(team.id)}
              onStop={() => stopTeam(team.id)}
            />
          ))}
        </ul>
      ) : (
        <>
          {!draft.gestart ? (
            <Knop size="groot" className="min-h-16 text-[20px]" onClick={startSpel}>
              Start het spel
            </Knop>
          ) : null}
          {type === "plaatsen" ? (
            <Volgorde
              teams={teams}
              plaatsen={draft.plaatsen}
              joker={jokerIds}
              placements={perTeam}
              disabled={!draft.gestart || vast}
              gelijk={gelijk}
              zetGelijk={setGelijk}
              onTik={tik}
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {teams.map((team) =>
                isCountType(type) ? (
                  <Teller
                    key={team.id}
                    team={team}
                    aantal={draft.aantallen[team.id] ?? 0}
                    joker={jokerIds.includes(team.id)}
                    placement={perTeam.get(team.id)}
                    disabled={!draft.gestart || vast}
                    onTel={(delta) => tel(team.id, delta)}
                  />
                ) : (
                  <Getal
                    key={team.id}
                    team={team}
                    type={type}
                    unit={game.unit}
                    tekst={draft.teksten[team.id] ?? ""}
                    joker={jokerIds.includes(team.id)}
                    placement={perTeam.get(team.id)}
                    disabled={!draft.gestart || vast}
                    onTyp={(text) => typ(team.id, text)}
                  />
                ),
              )}
            </ul>
          )}
        </>
      )}

      {vast ? (
        <Verzonden status={sentStatus} fout={sent?.fout} locked={view.locked} />
      ) : draft.gestart || type === "tijd" ? (
        <>
          {draft.gestart ? (
            <div className="mt-1 flex gap-2.5">
              <Knop variant="secundair" onClick={opnieuw} onBlur={() => setBevestig(false)}>
                {bevestig ? "Zeker weten?" : "Opnieuw"}
              </Knop>
              <Knop className="flex-1" disabled={!complete} onClick={verstuur}>
                Verstuur uitslag
              </Knop>
            </div>
          ) : null}
          {draft.gestart && !complete ? (
            <p className="m-0 text-[14px] leading-[1.4] text-zand">
              {bijElkaar(type === "tijd" ? "Stop eerst de tijd van elk team." : "Vul voor elk team een uitslag in.")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Stopwatch({ startEpoch, klaarMs }: { startEpoch: number | null; klaarMs: number | null }) {
  const lopend = useLopend(startEpoch, klaarMs === null);
  const ms = klaarMs ?? lopend;
  return (
    <span role="timer" aria-live="off" className="text-[clamp(44px,15vw,56px)] leading-none font-extrabold tracking-[-0.01em] cijfers">
      {formatStopwatch(ms)}
    </span>
  );
}

function StopKnop({
  team,
  tijd,
  gestart,
  joker,
  placement,
  disabled,
  onStop,
}: {
  team: Team;
  tijd: number | null;
  gestart: boolean;
  joker: boolean;
  placement: Placement | undefined;
  disabled: boolean;
  onStop: () => void;
}) {
  const kleur = TEAM_KLEUREN[team.color];
  const binnen = tijd !== null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onStop}
      className={`relative flex min-h-[124px] flex-col items-start justify-between gap-0.5 rounded-[20px] px-3.5 py-3 text-left text-[19px] leading-tight font-extrabold shadow-[0_5px_0_#140B06] active:translate-y-[3px] ${kleur.vlak} ${kleur.opVlak} ${
        !gestart ? "opacity-45" : ""
      }`}
    >
      <span>{binnen ? "Binnen" : "Stop"}</span>
      <span>
        {kleur.label}
        <span className="sr-only"> ({team.name})</span>
      </span>
      <span className="cijfers">{binnen ? formatSeconds(tijd) : gestart ? "loopt…" : "wacht"}</span>
      {binnen && placement ? (
        <span className="font-bold">
          {formatPoints(placement.twelfths)}&nbsp;p{placement.joker ? ", joker" : ""}
        </span>
      ) : joker ? (
        <span className="font-bold">Joker</span>
      ) : null}
      {binnen && placement?.place ? (
        <span className="absolute top-2.5 right-2.5 flex h-[34px] min-w-[34px] items-center justify-center rounded-pil bg-beeldbuis px-1.5 font-display text-[17px] text-studio motion-safe:animate-pop">
          <span className="sr-only">Plaats </span>
          {placement.place}
        </span>
      ) : null}
    </button>
  );
}

function Plaatsing({ placement, joker }: { placement: Placement | undefined; joker: boolean }) {
  const tekst = puntenTekst(placement);
  if (!tekst) return joker ? <p className="m-0 text-[14px] font-bold">{bijElkaar("Joker ingezet: de punten tellen dubbel.")}</p> : null;
  return <p className="m-0 text-[15px] font-bold">{bijElkaar(tekst)}</p>;
}

function RijKop({ team, joker, placement }: { team: Team; joker: boolean; placement: Placement | undefined }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamBalk kleur={team.color} className="h-7" />
      <span className="min-w-0 flex-1 text-[17px] leading-tight font-extrabold">{bijElkaar(team.name)}</span>
      {joker ? (
        <span className="inline-flex items-center gap-1 rounded-pil bg-mosterd px-2 py-0.5 text-[13px] font-extrabold">
          <IconJoker size={14} />
          Joker
        </span>
      ) : null}
      {placement?.place ? (
        <span className="flex h-[34px] min-w-[34px] items-center justify-center rounded-pil bg-studio px-1.5 font-display text-[17px] text-beeldbuis">
          <span className="sr-only">Plaats </span>
          {placement.place}
        </span>
      ) : null}
    </div>
  );
}

function NaElkaarRij({
  team,
  tijd,
  lopendSinds,
  joker,
  placement,
  vast,
  onStart,
  onStop,
}: {
  team: Team;
  tijd: number | null;
  lopendSinds: number | null;
  joker: boolean;
  placement: Placement | undefined;
  vast: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const lopend = useLopend(lopendSinds, lopendSinds !== null);
  return (
    <li className="op-licht flex flex-col gap-2 rounded-[18px] bg-beeldbuis p-3.5 text-studio shadow-tegel">
      <RijKop team={team} joker={joker} placement={tijd !== null ? placement : undefined} />
      <div className="flex items-center gap-3">
        <span role="timer" aria-live="off" className="min-w-0 flex-1 text-[34px] leading-none font-extrabold cijfers">
          {lopendSinds !== null ? formatStopwatch(lopend) : tijd !== null ? formatSeconds(tijd) : "00:00,00"}
        </span>
        {vast ? null : lopendSinds !== null ? (
          <Knop onClick={onStop} className="min-w-[96px]">
            Stop<span className="sr-only"> {team.name}</span>
          </Knop>
        ) : (
          <Knop variant={tijd !== null ? "secundair-licht" : "primair"} onClick={onStart} className="min-w-[96px]">
            {tijd !== null ? "Opnieuw" : "Start"}
            <span className="sr-only"> {team.name}</span>
          </Knop>
        )}
      </div>
      {tijd !== null ? <Plaatsing placement={placement} joker={joker} /> : joker ? <Plaatsing placement={undefined} joker /> : null}
    </li>
  );
}

function Teller({
  team,
  aantal,
  joker,
  placement,
  disabled,
  onTel,
}: {
  team: Team;
  aantal: number;
  joker: boolean;
  placement: Placement | undefined;
  disabled: boolean;
  onTel: (delta: number) => void;
}) {
  return (
    <li className="op-licht flex flex-col gap-2 rounded-[18px] bg-beeldbuis p-3.5 text-studio shadow-tegel">
      <RijKop team={team} joker={joker} placement={disabled ? undefined : placement} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || aantal === 0}
          onClick={() => onTel(-1)}
          aria-label={`Eén minder voor ${team.name}`}
          className="flex h-14 w-14 flex-none items-center justify-center rounded-pil border-[3px] border-studio bg-papier disabled:opacity-45"
        >
          <IconMin size={26} strokeWidth={2.6} />
        </button>
        <span className="min-w-0 flex-1 text-center font-display text-[44px] leading-none cijfers">{aantal}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onTel(1)}
          aria-label={`Eén erbij voor ${team.name}`}
          className="flex h-14 w-14 flex-none items-center justify-center rounded-pil bg-oranje text-studio shadow-knop active:translate-y-[3px] active:shadow-knop-in disabled:opacity-45"
        >
          <IconPlus size={26} strokeWidth={2.6} />
        </button>
      </div>
      {disabled ? null : <Plaatsing placement={placement} joker={joker} />}
    </li>
  );
}

function Getal({
  team,
  type,
  unit,
  tekst,
  joker,
  placement,
  disabled,
  onTyp,
}: {
  team: Team;
  type: ResultType;
  unit: string | null;
  tekst: string;
  joker: boolean;
  placement: Placement | undefined;
  disabled: boolean;
  onTyp: (text: string) => void;
}) {
  const id = useId();
  const value = parseDecimal(tekst);
  const fout = tekst.trim() && (value === null || checkResultValue(type, value, 4)) ? (value === null ? "Typ een getal." : checkResultValue(type, value, 4)) : null;
  const stap = (delta: number) => {
    const next = Math.min(10, Math.max(0, Math.round((value ?? 0) + delta)));
    onTyp(formatDecimal(next, 1));
  };
  return (
    <li className="op-licht flex flex-col gap-2 rounded-[18px] bg-beeldbuis p-3.5 text-studio shadow-tegel">
      <label htmlFor={id} className="flex items-center gap-2.5">
        <TeamBalk kleur={team.color} className="h-7" />
        <span className="min-w-0 flex-1 text-[17px] leading-tight font-extrabold">{bijElkaar(team.name)}</span>
        {joker ? (
          <span className="inline-flex items-center gap-1 rounded-pil bg-mosterd px-2 py-0.5 text-[13px] font-extrabold">
            <IconJoker size={14} />
            Joker
          </span>
        ) : null}
        {placement?.place && value !== null ? (
          <span className="flex h-[34px] min-w-[34px] items-center justify-center rounded-pil bg-studio px-1.5 font-display text-[17px] text-beeldbuis">
            <span className="sr-only">Plaats </span>
            {placement.place}
          </span>
        ) : null}
      </label>
      <div className="flex items-center gap-2.5">
        {type === "jury" ? (
          <button
            type="button"
            disabled={disabled || (value ?? 0) <= 0}
            onClick={() => stap(-1)}
            aria-label={`Eén punt lager voor ${team.name}`}
            className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-pil border-[3px] border-studio bg-papier disabled:opacity-45"
          >
            <IconMin size={24} strokeWidth={2.6} />
          </button>
        ) : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={tekst}
          disabled={disabled}
          placeholder={type === "jury" ? "1 tot 10" : "0"}
          aria-invalid={fout ? true : undefined}
          aria-describedby={fout ? `${id}-fout` : undefined}
          onChange={(event) => onTyp(event.target.value)}
          className="min-h-[52px] w-full min-w-0 rounded-tegel border-[3px] border-studio bg-papier px-3.5 text-center text-[24px] font-extrabold text-studio cijfers placeholder:text-[17px] placeholder:font-medium placeholder:text-[#8a6a55] aria-invalid:border-roest disabled:opacity-60"
        />
        {type === "jury" ? (
          <button
            type="button"
            disabled={disabled || (value ?? 0) >= 10}
            onClick={() => stap(1)}
            aria-label={`Eén punt hoger voor ${team.name}`}
            className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-pil bg-oranje text-studio shadow-knop disabled:opacity-45"
          >
            <IconPlus size={24} strokeWidth={2.6} />
          </button>
        ) : unit && isMeasureType(type) ? (
          <span className="flex-none text-[17px] font-bold">{unit}</span>
        ) : null}
      </div>
      {fout ? (
        <p id={`${id}-fout`} className="m-0 text-label font-bold text-roest">
          {fout}
        </p>
      ) : value !== null ? (
        <Plaatsing placement={placement} joker={joker} />
      ) : null}
    </li>
  );
}

function Volgorde({
  teams,
  plaatsen,
  joker,
  placements,
  disabled,
  gelijk,
  zetGelijk,
  onTik,
}: {
  teams: readonly Team[];
  plaatsen: Record<string, number>;
  joker: readonly string[];
  placements: Map<string, Placement>;
  disabled: boolean;
  gelijk: boolean;
  zetGelijk: (value: boolean) => void;
  onTik: (teamId: string) => void;
}) {
  const id = useId();
  const iemand = Object.keys(plaatsen).length > 0;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[15px] leading-[1.45]">{bijElkaar("Tik de teams aan in de volgorde van binnenkomst.")}</p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {teams.map((team) => {
          const kleur = TEAM_KLEUREN[team.color];
          const place = plaatsen[team.id];
          const placement = placements.get(team.id);
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={disabled || place !== undefined}
                onClick={() => onTik(team.id)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-[18px] px-4 text-left text-[19px] font-extrabold shadow-[0_5px_0_#140B06] active:translate-y-[3px] ${kleur.vlak} ${kleur.opVlak} ${
                  disabled && place === undefined ? "opacity-45" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  {bijElkaar(team.name)}
                  {joker.includes(team.id) ? ", joker" : ""}
                </span>
                {place !== undefined ? (
                  <span className="flex flex-none items-center gap-2">
                    {placement ? (
                      <span>
                        {formatPoints(placement.twelfths)}&nbsp;p
                      </span>
                    ) : null}
                    <span className="flex h-[38px] min-w-[38px] items-center justify-center rounded-pil bg-beeldbuis px-1.5 font-display text-[18px] text-studio">
                      <span className="sr-only">Plaats </span>
                      {place}
                    </span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px] font-bold">
        <input
          id={id}
          type="checkbox"
          checked={gelijk}
          disabled={disabled || !iemand}
          onChange={(event) => zetGelijk(event.target.checked)}
          className="h-6 w-6 flex-none cursor-pointer accent-oranje"
        />
        {bijElkaar("Het volgende team deelt de plaats met het vorige")}
      </label>
    </div>
  );
}

function Verzonden({ status, fout, locked }: { status: string | null; fout: string | undefined; locked: boolean }) {
  if (status === "verstuurd") {
    return (
      <Melding tone="goed">
        <span className="flex items-center gap-2.5">
          <IconVinkje size={22} strokeWidth={3} className="flex-none" />
          <span>
            {bijElkaar(
              locked
                ? "Uitslag verstuurd. Het scorebord blijft op slot, de beheerder kan nog corrigeren."
                : "Uitslag verstuurd. De beheerder kan nog corrigeren.",
            )}
          </span>
        </span>
      </Melding>
    );
  }
  if (status === "fout") {
    return <Melding tone="fout">{bijElkaar(fout ?? "Deze uitslag kwam niet aan. Vraag het de beheerder.")}</Melding>;
  }
  return (
    <Melding tone="info">
      <span className="flex items-center gap-2.5">
        <IconWifiUit size={22} className="flex-none" />
        <span>
          {bijElkaar(`Wacht op verbinding… De uitslag staat veilig op deze telefoon en gaat vanzelf.${fout ? ` ${fout}` : ""}`)}
        </span>
      </span>
    </Melding>
  );
}

function AlKlaar({ view }: { view: StaffGameView }) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <Melding tone="info">
        {bijElkaar(
          view.entered
            ? `Dit spel is al klaar. De uitslag kwam van ${view.entered.by} om ${formatTime(new Date(view.entered.at))}. De beheerder kan nog corrigeren.`
            : "Dit spel is al klaar. De beheerder kan de uitslag nog corrigeren.",
        )}
      </Melding>
      {view.results ? <UitslagLijst rijen={view.results} /> : null}
    </div>
  );
}

function UitslagLijst({ rijen }: { rijen: PlacementView[] }) {
  return (
    <ol aria-label="Uitslag" className="op-licht m-0 flex list-none flex-col gap-1 rounded-[18px] bg-beeldbuis p-3.5 text-studio shadow-tegel">
      {rijen.map((rij) => (
        <li key={rij.team.id} className="flex items-center gap-2.5 text-[15px]">
          <span className="w-8 flex-none text-center font-extrabold">{rij.place ? placeText(rij.place) : "–"}</span>
          <TeamBalk kleur={rij.team.color} className="h-6" />
          <span className="min-w-0 flex-1 leading-snug">
            <span className="font-bold">{rij.team.name}</span>
            {rij.valueText ? (
              <span className="block text-[13px]">
                {rij.valueText}
                {rij.joker ? ", met joker" : ""}
              </span>
            ) : null}
          </span>
          <Punten twelfths={rij.twelfths} className="font-extrabold" />
        </li>
      ))}
    </ol>
  );
}
