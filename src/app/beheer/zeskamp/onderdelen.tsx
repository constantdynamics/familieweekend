"use client";

import { useActionState, useId, useState } from "react";
import { TeamBalk } from "@/components/score/Punten";
import { Keuzelijst, Tekstvak, Vinkje } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { formatPoints } from "@/lib/shared/scoring";
import { bijElkaar } from "@/lib/shared/tekst";
import type { TeamColor } from "@/lib/shared/teams";
import {
  formatDecimal,
  MODE_LABELS,
  parseDecimal,
  placeText,
  rankGame,
  RESULT_TYPE_LABELS,
  RESULT_TYPES,
  GAME_MODES,
  type GameMode,
  type ResultType,
} from "@/lib/shared/zeskamp";
import {
  bewaarPuntentabel,
  bewaarSpel,
  bewaarUitslag,
  bewaarVrijdag,
  verwijderSpel,
  voegSpelToe,
  zetJokerBeheer,
  zetSpelTerug,
  type ZeskampState,
} from "./actions";

type TeamRef = { id: string; name: string; color: TeamColor };

export type SpelWaarden = {
  id: string | null;
  name: string;
  description: string | null;
  sort: number;
  resultType: ResultType | null;
  unit: string | null;
  mode: GameMode;
  jokerAllowed: boolean;
};

/** Add a game (id null) or change one: name, explanation, order, result type, unit, mode and joker. */
export function SpelFormulier({ spel, typeVast }: { spel: SpelWaarden; typeVast?: boolean }) {
  const [state, action, pending] = useActionState<ZeskampState, FormData>(spel.id ? bewaarSpel : voegSpelToe, {});
  const velden = state.velden ?? {};
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {spel.id ? <input type="hidden" name="id" value={spel.id} /> : null}
      <Veld label="Naam" name="naam" defaultValue={spel.name} maxLength={60} autoComplete="off" error={velden.naam} />
      <Tekstvak label="Korte uitleg" name="uitleg" rows={3} defaultValue={spel.description ?? ""} hint={bijElkaar("Optioneel. De familie ziet dit bij het spel.")} error={velden.uitleg} />
      <Keuzelijst
        label="Uitslagtype"
        name="uitslagtype"
        defaultValue={spel.resultType ?? ""}
        error={velden.uitslagtype}
        hint={bijElkaar(typeVast ? "Vast zolang dit spel een uitslag heeft." : "Hoe het spel beslist wordt.")}
      >
        <option value="" disabled>
          Kies een uitslagtype
        </option>
        {RESULT_TYPES.map((type) => (
          <option key={type} value={type}>
            {RESULT_TYPE_LABELS[type]}
          </option>
        ))}
      </Keuzelijst>
      <Veld label="Eenheid" name="eenheid" defaultValue={spel.unit ?? ""} maxLength={20} autoComplete="off" hint={bijElkaar("Bijvoorbeeld cm, gram of ballen. Leeg mag.")} error={velden.eenheid} className="max-w-[260px]" />
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[15px] font-bold">Modus</legend>
        <div className="grid grid-cols-1 gap-2">
          {GAME_MODES.map((mode) => (
            <label
              key={mode}
              htmlFor={`${id}-${mode}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand"
            >
              <input id={`${id}-${mode}`} type="radio" name="modus" value={mode} defaultChecked={spel.mode === mode} className="h-5 w-5 accent-oranje" />
              <span className="text-[16px] font-bold">{bijElkaar(MODE_LABELS[mode])}</span>
            </label>
          ))}
        </div>
        {velden.modus ? <p className="m-0 text-label font-bold text-roest">{velden.modus}</p> : null}
      </fieldset>
      <Veld label="Volgorde" name="volgorde" type="number" inputMode="numeric" min={1} max={99} defaultValue={spel.sort} error={velden.volgorde} className="max-w-[160px]" />
      <Vinkje name="joker" label="De joker mag bij dit spel" defaultChecked={spel.jokerAllowed} />
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" disabled={pending}>
        {pending ? "Bezig met bewaren…" : spel.id ? "Bewaar spel" : "Voeg spel toe"}
      </Knop>
    </form>
  );
}

/** Two-step forms: tick, then act. */
function Bevestigd({
  action,
  id,
  vraag,
  knop,
}: {
  action: (state: ZeskampState, formData: FormData) => Promise<ZeskampState>;
  id: string;
  vraag: string;
  knop: string;
}) {
  const [state, run, pending] = useActionState<ZeskampState, FormData>(action, {});
  const [zeker, setZeker] = useState(false);
  return (
    <form action={run} className="flex flex-col gap-2.5" noValidate>
      <input type="hidden" name="id" value={id} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-bold">
        <input type="checkbox" name="zeker" checked={zeker} onChange={(event) => setZeker(event.target.checked)} className="h-6 w-6 flex-none cursor-pointer accent-oranje" />
        {bijElkaar(vraag)}
      </label>
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" variant="secundair-licht" size="klein" className="self-start" disabled={pending || !zeker}>
        {pending ? "Bezig…" : knop}
      </Knop>
    </form>
  );
}

export function TerugzettenFormulier({ id }: { id: string }) {
  return <Bevestigd action={zetSpelTerug} id={id} vraag="Ja, de uitslag mag weg" knop="Zet terug naar gepland" />;
}

export function VerwijderFormulier({ id }: { id: string }) {
  return <Bevestigd action={verwijderSpel} id={id} vraag="Ja, verwijder dit spel" knop="Verwijder spel" />;
}

/** Correct the result per team. Times as 1:02,34; empty means no result. */
export function UitslagFormulier({
  id,
  type,
  unit,
  teams,
  waarden,
}: {
  id: string;
  type: ResultType;
  unit: string | null;
  teams: TeamRef[];
  waarden: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ZeskampState, FormData>(bewaarUitslag, {});
  const velden = state.velden ?? {};
  const hint =
    type === "tijd"
      ? "Minuten, seconden en honderdsten: 1:02,34."
      : type === "plaatsen"
        ? "De plaats: 1, 2, 3 of 4. Gelijk mag."
        : type === "jury"
          ? "Het jurycijfer, van 0 tot 10."
          : unit
            ? `In ${unit}.`
            : "Een getal.";
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <p className="m-0 text-label leading-[1.4]">{bijElkaar(`${hint} Leeg betekent: geen uitslag.`)}</p>
      {teams.map((team) => (
        <div key={team.id} className="flex items-end gap-2.5">
          <TeamBalk kleur={team.color} className="mb-2 h-9" />
          <Veld
            label={team.name}
            name={`waarde-${team.id}`}
            defaultValue={waarden[team.id] ?? ""}
            inputMode={type === "tijd" ? "text" : "decimal"}
            autoComplete="off"
            error={velden[team.id]}
            className="min-w-0 flex-1"
          />
        </div>
      ))}
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
      <Knop type="submit" disabled={pending}>
        {pending ? "Bezig met bewaren…" : "Bewaar uitslag"}
      </Knop>
    </form>
  );
}

/** Put a team's zeskamp joker on this game (any time: the admin corrects), or take it away. */
export function JokerFormulier({
  id,
  teams,
  hier,
  elders,
}: {
  id: string;
  teams: TeamRef[];
  /** Teams whose joker is on this game. */
  hier: TeamRef[];
  /** Per team the game its joker is on now, if elsewhere. */
  elders: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ZeskampState, FormData>(zetJokerBeheer, {});
  const anderen = teams.filter((team) => !hier.some((h) => h.id === team.id));
  return (
    <div className="flex flex-col gap-3">
      {hier.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {hier.map((team) => (
            <li key={team.id} className="flex items-center gap-2.5">
              <TeamBalk kleur={team.color} className="h-7" />
              <span className="min-w-0 flex-1 text-[16px] font-bold">{team.name}</span>
              <form action={action}>
                <input type="hidden" name="team" value={team.id} />
                <input type="hidden" name="spel" value="" />
                <Knop type="submit" variant="secundair-licht" size="klein" disabled={pending}>
                  Haal weg<span className="sr-only"> bij {team.name}</span>
                </Knop>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[15px]">{bijElkaar("Nog geen joker op dit spel.")}</p>
      )}
      {anderen.length > 0 ? (
        <form action={action} className="flex flex-col gap-2.5 border-t-2 border-papier-streep pt-3" noValidate>
          <input type="hidden" name="spel" value={id} />
          <Keuzelijst label="Zet de joker van" name="team" defaultValue={anderen[0]?.id}>
            {anderen.map((team) => (
              <option key={team.id} value={team.id}>
                {elders[team.id] ? `${team.name} (nu bij ${elders[team.id]})` : team.name}
              </option>
            ))}
          </Keuzelijst>
          <Knop type="submit" variant="secundair-licht" size="klein" className="self-start" disabled={pending}>
            Zet de joker op dit spel
          </Knop>
        </form>
      ) : null}
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
      {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
    </div>
  );
}

/**
 * Vrijdag (SPEC §4.8): free points per team, plus the helper for
 * "omgekeerd uitbeelden": the fewest guessed wins, the app works out the
 * places and suggests points, and the admin adds them and saves.
 */
export function VrijdagFormulier({ teams, punten, tabel }: { teams: TeamRef[]; punten: Record<string, number>; tabel: number[] }) {
  const [state, action, pending] = useActionState<ZeskampState, FormData>(bewaarVrijdag, {});
  const [waarden, setWaarden] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map((team) => [team.id, punten[team.id] === undefined ? "" : formatDecimal(punten[team.id] / 12, 2)])),
  );
  const [aantallen, setAantallen] = useState<Record<string, string>>({});
  const [opgeteld, setOpgeteld] = useState(false);
  const velden = state.velden ?? {};
  const id = useId();

  const counts = teams.map((team) => {
    const value = parseDecimal(aantallen[team.id] ?? "");
    return { team: team.id, value: value !== null && Number.isInteger(value) && value >= 0 ? value : null };
  });
  const volledig = counts.every((count) => count.value !== null);
  const voorstel = volledig ? rankGame(counts, "aantal_laag", tabel) : [];

  const telOp = () => {
    setWaarden((current) => {
      const next = { ...current };
      for (const row of voorstel) {
        const now = parseDecimal(current[row.team] ?? "") ?? 0;
        next[row.team] = formatDecimal(now + row.twelfths / 12, 2);
      }
      return next;
    });
    setOpgeteld(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <Kaart className="flex flex-col gap-3">
        <h3 className="m-0 text-[19px] font-extrabold">Vrije punten per team</h3>
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar("Tel alle spelletjes van de middag bij elkaar op. Medailles gaan naar de meeste punten.")}
        </p>
        <form action={action} className="flex flex-col gap-3" noValidate>
          {teams.map((team) => (
            <div key={team.id} className="flex items-end gap-2.5">
              <TeamBalk kleur={team.color} className="mb-2 h-9" />
              <Veld
                label={team.name}
                name={`punten-${team.id}`}
                value={waarden[team.id] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setWaarden((current) => ({ ...current, [team.id]: value }));
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                error={velden[team.id]}
                className="min-w-0 flex-1"
              />
            </div>
          ))}
          {opgeteld && !state.gelukt ? <Melding tone="info">{bijElkaar("Opgeteld. Tik op Bewaar om de punten vast te zetten.")}</Melding> : null}
          {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
          {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
          <Knop type="submit" disabled={pending}>
            {pending ? "Bezig met bewaren…" : "Bewaar punten van vrijdag"}
          </Knop>
        </form>
      </Kaart>

      <Kaart className="flex flex-col gap-3">
        <h3 className="m-0 text-[19px] font-extrabold">Puntenhulp: omgekeerd uitbeelden</h3>
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar("Wie het minst raadt, wint. Vul per team in hoeveel er geraden is. De app rekent de plaatsen uit en stelt punten voor.")}
        </p>
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby={`${id}-uitleg`}>
          <legend className="sr-only">Aantal geraden per team</legend>
          {teams.map((team) => (
            <div key={team.id} className="flex items-end gap-2.5">
              <TeamBalk kleur={team.color} className="mb-2 h-9" />
              <Veld
                label={`${team.name}: aantal geraden`}
                name={`geraden-${team.id}`}
                value={aantallen[team.id] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setAantallen((current) => ({ ...current, [team.id]: value }));
                  setOpgeteld(false);
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className="min-w-0 flex-1"
              />
            </div>
          ))}
        </fieldset>
        <p id={`${id}-uitleg`} className="m-0 text-label leading-[1.4]">
          {volledig ? "Het voorstel:" : bijElkaar("Vul voor elk team een aantal in, dan verschijnt het voorstel.")}
        </p>
        {volledig ? (
          <>
            <ol className="m-0 flex list-none flex-col gap-1.5 rounded-[16px] bg-papier p-3 text-[15px]">
              {voorstel.map((row) => {
                const team = teams.find((t) => t.id === row.team);
                return (
                  <li key={row.team} className="flex items-center gap-2.5">
                    <span className="w-9 flex-none font-extrabold">{row.place ? placeText(row.place) : "–"}</span>
                    {team ? <TeamBalk kleur={team.color} className="h-6" /> : null}
                    <span className="min-w-0 flex-1 font-bold">
                      {team?.name}
                      {row.shared ? ", gedeeld" : ""}
                    </span>
                    <span className="font-extrabold cijfers">{formatPoints(row.twelfths)}&nbsp;punten</span>
                  </li>
                );
              })}
            </ol>
            <Knop variant="secundair-licht" onClick={telOp} className="self-start">
              Tel op bij de vrije punten
            </Knop>
          </>
        ) : null}
      </Kaart>
    </div>
  );
}

export function PuntentabelFormulier({ tabel }: { tabel: number[] }) {
  const [state, action, pending] = useActionState<ZeskampState, FormData>(bewaarPuntentabel, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Punten per plaats</h3>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Veld
          label="Plaatspunten van de zeskamp"
          name="tabel"
          defaultValue={tabel.join(", ")}
          autoComplete="off"
          hint={bijElkaar("Van de eerste plaats naar de laatste. Gedeelde plaatsen delen de punten, de joker telt dubbel.")}
          error={state.velden?.tabel}
        />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met bewaren…" : "Bewaar puntentabel"}
        </Knop>
      </form>
    </Kaart>
  );
}
