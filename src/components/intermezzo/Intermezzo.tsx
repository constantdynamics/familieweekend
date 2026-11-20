"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { TeamVlak } from "@/components/team/TeamKleur";
import { Melding } from "@/components/ui/Kaart";
import { pokeLive, useLive } from "@/lib/client/live";
import type { IntermezzoView } from "@/lib/server/intermezzo";
import type { RpsChoice } from "@/lib/shared/rps";
import type { TeamColor } from "@/lib/shared/teams";
import { kies } from "./actions";
import { KEUZES, KeuzeSymbool } from "./symbolen";

const LABEL: Record<RpsChoice, string> = { steen: "steen", papier: "papier", schaar: "schaar" };

/** Seconds left until `iso`, on the server's clock, ticking every 100 ms. */
function useAftellen(iso: string | null, offsetMs: number, klaar: () => void): number | null {
  const [over, setOver] = useState<number | null>(null);
  const klaarRef = useRef(klaar);
  useEffect(() => {
    klaarRef.current = klaar;
  }, [klaar]);
  useEffect(() => {
    if (!iso) return;
    const doel = Date.parse(iso);
    let gemeld = false;
    const tik = () => {
      const ms = doel - (Date.now() + offsetMs);
      setOver(Math.max(0, ms));
      if (ms <= 0 && !gemeld) {
        gemeld = true;
        klaarRef.current();
      }
    };
    const timer = setInterval(tik, 100);
    const eerste = setTimeout(tik, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(eerste);
    };
  }, [iso, offsetMs]);
  return iso ? over : null;
}

function useMinderBeweging(): boolean {
  const [minder, setMinder] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMinder(query.matches);
    const timer = setTimeout(update, 0);
    query.addEventListener("change", update);
    return () => {
      clearTimeout(timer);
      query.removeEventListener("change", update);
    };
  }, []);
  return minder;
}

/** A quick roll of names that stops on the drawn name. */
function Namenrol({ naam, namen, rollen }: { naam: string; namen: string[]; rollen: boolean }) {
  if (!rollen || namen.length < 3) return <span>{naam}</span>;
  const strook = Array.from({ length: 10 }, (_, i) => namen[(i * 7 + naam.length) % namen.length]);
  return (
    <span className="relative inline-block h-[1lh] overflow-hidden align-bottom">
      <span className="namenrol flex flex-col">
        {strook.map((n, i) => (
          <span key={i} aria-hidden="true">
            {n}
          </span>
        ))}
        <span>{naam}</span>
      </span>
    </span>
  );
}

function Speler({
  naam,
  team,
  kleur,
  koos,
  keuze,
  winnaar,
  namen,
  rollen,
}: {
  naam: string;
  team: string;
  kleur: string;
  koos: boolean;
  keuze: RpsChoice | null;
  winnaar: boolean | null;
  namen: string[];
  rollen: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-kaart px-2 py-3 text-center transition-opacity ${
        winnaar === false ? "opacity-50" : ""
      } ${winnaar ? "bg-mosterd text-studio" : "bg-studio-licht"}`}
    >
      <span className="text-[19px] leading-tight font-extrabold">
        <Namenrol naam={naam} namen={namen} rollen={rollen} />
      </span>
      <span className="flex items-center gap-1.5 text-label">
        <TeamVlak kleur={kleur as TeamColor} className="h-4 w-4" />
        {team}
      </span>
      {keuze ? (
        <span className="flex flex-col items-center gap-1 text-[16px] font-bold">
          <KeuzeSymbool keuze={keuze} size={52} />
          {LABEL[keuze]}
        </span>
      ) : (
        <span className="min-h-11 text-label leading-[1.35]">{koos ? "heeft gekozen" : "denkt na…"}</span>
      )}
    </div>
  );
}

/**
 * Steen, papier, schaar (SPEC §4.7) on every phone. The drawn players choose
 * in secret here; everyone else follows the duel. Choices stay on the server
 * until the 3-2-1 is over.
 */
export function Intermezzo() {
  const { data, updatedAt, refresh } = useLive<IntermezzoView>("/api/intermezzo");
  const [pending, startTransition] = useTransition();
  const [gekozen, setGekozen] = useState<Record<string, RpsChoice>>({});
  const [fout, setFout] = useState<string | null>(null);
  const minderBeweging = useMinderBeweging();

  // Roll the names only when a new duel appears while this screen is open.
  const [rolVoor, setRolVoor] = useState<string | null>(null);
  const vorige = useRef<string | null | undefined>(undefined);
  const duelId = data?.duel?.id ?? null;
  useEffect(() => {
    if (data === null) return;
    if (vorige.current === undefined) {
      vorige.current = duelId;
      return;
    }
    if (duelId && duelId !== vorige.current) {
      const timer = setTimeout(() => setRolVoor(duelId), 0);
      vorige.current = duelId;
      return () => clearTimeout(timer);
    }
    vorige.current = duelId;
  }, [data, duelId]);

  const offset = data && updatedAt ? Date.parse(data.serverNow) - updatedAt : 0;
  const duel = data?.duel ?? null;
  const aftellen = duel?.status === "aftellen" ? duel.revealAt : null;
  const over = useAftellen(aftellen, offset, refresh);
  // After a draw the server sets up a fresh choice; ask again a little later.
  useEffect(() => {
    if (duel?.status !== "gelijk" || !duel.revealAt) return;
    const wacht = Date.parse(duel.revealAt) + 2700 - (Date.now() + offset);
    const timer = setTimeout(refresh, Math.max(300, wacht));
    return () => clearTimeout(timer);
  }, [duel?.status, duel?.revealAt, offset, refresh]);

  if (!data) {
    return (
      <section aria-busy="true" className="rounded-kaart bg-studio-licht p-5">
        <p className="m-0 text-[16px] text-zand">Het intermezzo laden…</p>
      </section>
    );
  }

  const rollen = !minderBeweging && rolVoor === duel?.id;
  const winnaar = duel?.winnerId ?? null;

  return (
    <section aria-labelledby="intermezzo-titel" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="intermezzo-titel" className="m-0 font-display text-[28px] leading-[1.1] font-normal schaduw-oranje">
          Steen, papier, schaar!
        </h2>
        <p className="m-0 text-[15px] leading-[1.4] text-zand">
          De winnaar blijft staan. Elk gewonnen duel is een punt voor je team.
        </p>
      </div>

      {data.mustChoose.map((speler) =>
        gekozen[speler.id] ? null : (
          <div key={speler.id} className="op-licht flex flex-col gap-3 rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart">
            <p className="m-0 text-[22px] leading-tight font-extrabold" role="alert">
              {data.mustChoose.length > 1 ? `${speler.name}, jij bent gekozen!` : "Jij bent gekozen!"} Kies in het geheim.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {KEUZES.map(({ keuze, label, Icon }) => (
                <button
                  key={keuze}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setFout(null);
                    startTransition(async () => {
                      const result = await kies(speler.id, keuze);
                      if ("fout" in result) setFout(result.fout);
                      else {
                        setGekozen((g) => ({ ...g, [speler.id]: keuze }));
                        pokeLive();
                      }
                    });
                  }}
                  className="flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-tegel border-[3px] border-studio bg-papier text-[16px] font-extrabold text-studio shadow-tegel active:translate-y-0.5"
                >
                  <Icon size={48} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ),
      )}
      {Object.entries(gekozen).some(([id]) => data.mustChoose.some((s) => s.id === id)) ? (
        <Melding tone="info">Gekozen! Wacht op je tegenstander.</Melding>
      ) : null}
      {fout ? <Melding tone="fout">{fout}</Melding> : null}

      {duel ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          <p className="m-0 text-center text-label font-bold text-zand">Duel {duel.seq}</p>
          <div className="flex items-stretch gap-2">
            <Speler
              naam={duel.champion.name}
              team={duel.champion.teamName}
              kleur={duel.champion.teamColor}
              koos={duel.championChose}
              keuze={duel.championChoice}
              winnaar={winnaar ? winnaar === duel.champion.id : null}
              namen={data.names}
              rollen={rollen}
            />
            <span className="self-center font-display text-[22px] text-mosterd" aria-hidden="true">
              vs
            </span>
            <Speler
              naam={duel.challenger.name}
              team={duel.challenger.teamName}
              kleur={duel.challenger.teamColor}
              koos={duel.challengerChose}
              keuze={duel.challengerChoice}
              winnaar={winnaar ? winnaar === duel.challenger.id : null}
              namen={data.names}
              rollen={rollen}
            />
          </div>
          {duel.status === "aftellen" && over !== null && over > 0 ? (
            <p key={Math.ceil(over / 1000)} className="tel m-0 text-center font-display text-[88px] leading-none text-mosterd">
              {Math.min(3, Math.ceil(over / 1000))}
            </p>
          ) : null}
          <p className="m-0 text-center text-[18px] leading-tight font-extrabold">
            {duel.inRealLife
              ? "Ze spelen het in het echt. De quizmaster tikt de winnaar aan."
              : duel.status === "kiezen"
                ? "Ze kiezen in het geheim…"
                : duel.status === "aftellen"
                  ? "Allebei gekozen!"
                  : duel.status === "gelijk"
                    ? "Gelijkspel! Ze kiezen opnieuw."
                    : winnaar
                      ? `${winnaar === duel.champion.id ? duel.champion.name : duel.challenger.name} wint!`
                      : ""}
          </p>
        </div>
      ) : (
        <p className="m-0 rounded-kaart bg-studio-licht p-4 text-center text-[16px] text-zand">
          De quizmaster loot zo de eerste twee spelers.
        </p>
      )}

      {data.current && data.current.count >= 2 ? (
        <p className="m-0 text-center text-[17px] font-extrabold text-mosterd">
          {data.current.name}: {data.current.count} op rij!
        </p>
      ) : null}

      {data.wins.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" aria-label="Gewonnen duels per team">
          {data.wins.map((t) => (
            <li key={t.team} className="flex items-center gap-2 rounded-[14px] bg-studio-licht px-3 py-2 text-[15px]">
              <TeamVlak kleur={t.color as TeamColor} className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="font-extrabold cijfers">{t.wins}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
