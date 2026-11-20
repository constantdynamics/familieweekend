"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TEAM_KLEUREN, TeamVlak } from "@/components/team/TeamKleur";
import { IconPijlVerder } from "@/components/ui/icons";
import { Keuzelijst, Tekstvak } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { PinOnthulling } from "@/components/ui/PinOnthulling";
import { Veld } from "@/components/ui/Veld";
import { TEAM_COLORS, type TeamColor } from "@/lib/shared/teams";
import {
  bewaarTeam,
  maakTeamPin,
  nieuweSpelleiderPin,
  plakDeelnemers,
  stopSpelleiderActie,
  voegSpelleiderToe,
  type BeheerState,
} from "./actions";

export type TeamView = {
  id: string;
  name: string;
  color: TeamColor;
  sort: number;
  hasPin: boolean;
  captainSinds: string | null;
  leden: number;
};

export function TeamFormulier({ team }: { team: TeamView }) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(bewaarTeam, {});
  const [pinState, pinAction, pinPending] = useActionState<BeheerState, FormData>(maakTeamPin, {});
  const velden = state.velden ?? {};
  return (
    <Kaart className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <TeamVlak kleur={team.color} className="h-6 w-6" />
        <h3 className="m-0 text-[19px] leading-tight font-extrabold">{team.name}</h3>
        <span className="ml-auto text-label">{team.leden === 1 ? "1 lid" : `${team.leden} leden`}</span>
      </div>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={team.id} />
        <Veld label="Naam" name="naam" defaultValue={team.name} maxLength={40} error={velden.naam} autoComplete="off" />
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[15px] font-bold">Kleur</legend>
          <div className="grid grid-cols-2 gap-2">
            {TEAM_COLORS.map((kleur) => (
              <label
                key={kleur}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand"
              >
                <input type="radio" name="kleur" value={kleur} defaultChecked={team.color === kleur} className="h-5 w-5 accent-oranje" />
                <TeamVlak kleur={kleur} />
                <span className="text-[16px] font-bold">{TEAM_KLEUREN[kleur].label}</span>
              </label>
            ))}
          </div>
          {velden.kleur ? <p className="m-0 text-label font-bold text-roest">{velden.kleur}</p> : null}
        </fieldset>
        <Veld
          label="Volgorde"
          name="volgorde"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          defaultValue={team.sort}
          error={velden.volgorde}
          className="max-w-[160px]"
        />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met bewaren…" : "Bewaar team"}
        </Knop>
      </form>
      <div className="flex flex-col gap-2 border-t-2 border-papier-streep pt-3">
        <p className="m-0 text-label leading-[1.4]">
          {team.hasPin ? "Team-PIN is gemaakt. " : "Nog geen team-PIN. "}
          {team.captainSinds ? `Het captaintoestel is actief sinds ${team.captainSinds}.` : "Er is nog geen captaintoestel."}
        </p>
        <form action={pinAction}>
          <input type="hidden" name="id" value={team.id} />
          <Knop type="submit" variant="secundair-licht" size="klein" disabled={pinPending}>
            {pinPending ? "Bezig…" : team.hasPin ? "Maak een nieuwe team-PIN" : "Maak de team-PIN"}
          </Knop>
        </form>
        {pinState.pin ? <PinOnthulling pin={pinState.pin} voor={`de captain van ${team.name}`} /> : null}
        {pinState.fout ? <Melding tone="fout">{pinState.fout}</Melding> : null}
      </div>
    </Kaart>
  );
}

export function PlakLijst({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(plakDeelnemers, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Namen plakken</h3>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Tekstvak
          label="Eén naam per regel"
          name="namen"
          rows={6}
          placeholder={"Sanne Valkenburg\nTim Valkenburg\nOma Riet"}
          hint="Nummers en opsommingstekens haalt de app zelf weg. Elke naam mag maar één keer voorkomen."
        />
        <Keuzelijst label="In team" name="team" defaultValue="">
          <option value="">Nog geen team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Keuzelijst>
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met toevoegen…" : "Voeg namen toe"}
        </Knop>
      </form>
    </Kaart>
  );
}

export type DeelnemerView = {
  id: string;
  name: string;
  nickname: string | null;
  isChild: boolean;
  isCaptain: boolean;
  claimed: boolean;
  funfactsKlaar: boolean;
};

export function DeelnemerRij({ deelnemer }: { deelnemer: DeelnemerView }) {
  const labels = [
    deelnemer.isCaptain ? "captain" : null,
    deelnemer.isChild ? "kind" : null,
    deelnemer.claimed ? "naam gekozen" : null,
    deelnemer.funfactsKlaar ? "fun facts klaar" : null,
  ].filter(Boolean);
  return (
    <li className="flex">
      <Link
        href={`/beheer/deelnemers/${deelnemer.id}`}
        className="flex min-h-[56px] flex-1 items-center gap-3 rounded-[16px] bg-studio-licht px-4 py-2.5 text-beeldbuis no-underline hover:text-beeldbuis"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] leading-tight font-bold">
            {deelnemer.name}
            {deelnemer.nickname ? <span className="font-medium text-zand"> ({deelnemer.nickname})</span> : null}
          </span>
          {labels.length > 0 ? <span className="text-label text-zand">{labels.join(" · ")}</span> : null}
        </span>
        <IconPijlVerder size={18} className="flex-none text-zand" />
      </Link>
    </li>
  );
}

export function SpelleiderToevoegen() {
  const [state, action, pending] = useActionState<BeheerState, FormData>(voegSpelleiderToe, {});
  return (
    <Kaart className="flex flex-col gap-3">
      <h3 className="m-0 text-[19px] font-extrabold">Spelleider toevoegen</h3>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Veld label="Naam" name="naam" maxLength={60} autoComplete="off" error={state.velden?.naam} />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig…" : "Voeg spelleider toe"}
        </Knop>
      </form>
      {state.pin ? <PinOnthulling pin={state.pin} voor={state.gelukt?.replace(" is spelleider.", "") ?? "de spelleider"} /> : null}
    </Kaart>
  );
}

export function SpelleiderRij({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, action, pending] = useActionState<BeheerState, FormData>(nieuweSpelleiderPin, {});
  return (
    <li className="flex flex-col gap-2 rounded-[16px] bg-studio-licht px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[16px] font-bold">{name}</span>
        <span className="text-label text-zand">{active ? "actief" : "gestopt"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <Knop type="submit" variant="secundair" size="klein" disabled={pending}>
            {pending ? "Bezig…" : "Nieuwe PIN"}
          </Knop>
        </form>
        {active ? (
          <form action={stopSpelleiderActie}>
            <input type="hidden" name="id" value={id} />
            <Knop type="submit" variant="secundair" size="klein">
              Stop als spelleider
            </Knop>
          </form>
        ) : null}
      </div>
      {state.pin ? <PinOnthulling pin={state.pin} voor={name} /> : null}
      {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
    </li>
  );
}
