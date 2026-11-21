"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { IconKaartjes, IconMin, IconOog, IconOogDicht, IconPlus, IconStopwatch } from "@/components/ui/icons";
import { IconStart } from "@/components/ui/icons-zeskamp";
import { Tekstvak } from "@/components/ui/Invoer";
import { Kaart, Melding, Paneel } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { bijElkaar } from "@/lib/shared/tekst";
import { bewaarKaartjes, verwijderKaartjes, type KaartjesState } from "./actions";

/**
 * The game helper (SPEC §4.8 "Spelhulp"): a card machine with the words or
 * tasks the spelleider pasted beforehand, one big card for the performer, a
 * timer (60 seconds by default), "Geraden" and "Volgende", and a counter.
 * Everything during play stays on this phone.
 */

type Deck = { id: string; name: string; cards: string[] };

/** A shuffled order of `n` cards (Fisher-Yates). Only called from a tap. */
function schud(n: number): number[] {
  const order = Array.from({ length: n }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function nu(): number {
  return Date.now();
}

function trillen(patroon: number | number[] = 30) {
  try {
    navigator.vibrate?.(patroon);
  } catch {
    // Not every phone can.
  }
}

export function Spelhulp({ decks }: { decks: Deck[] }) {
  const [spel, setSpel] = useState<{ deck: Deck; volgorde: number[] } | null>(null);
  const [bewerk, setBewerk] = useState<string | null>(decks.length === 0 ? "nieuw" : null);

  if (spel) return <KaartjesMachine key={spel.deck.id} deck={spel.deck} start={spel.volgorde} onStop={() => setSpel(null)} />;

  const speel = (deck: Deck) => setSpel({ deck, volgorde: schud(deck.cards.length) });

  return (
    <div className="mt-6 flex flex-col gap-4">
      {decks.length === 0 ? (
        <p className="m-0 rounded-[18px] bg-studio-licht px-4 py-3 text-[15px] leading-[1.45]">
          {bijElkaar(
            "Nog geen kaartjes. Plak hieronder je woorden of opdrachten, één per regel. Dan ligt de stapel klaar als het spel begint.",
          )}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {decks.map((deck) => (
            <li key={deck.id} className="flex flex-col gap-3">
              <Kaart className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd">
                    <IconKaartjes size={22} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h2 className="m-0 text-[19px] leading-tight font-extrabold">{bijElkaar(deck.name)}</h2>
                    <p className="m-0 text-label">{deck.cards.length === 1 ? "1 kaartje" : `${deck.cards.length} kaartjes`}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Knop onClick={() => speel(deck)}>
                    <IconStart size={18} />
                    Speel<span className="sr-only"> met {deck.name}</span>
                  </Knop>
                  <Knop variant="secundair-licht" onClick={() => setBewerk(bewerk === deck.id ? null : deck.id)} aria-expanded={bewerk === deck.id}>
                    Bewerk<span className="sr-only"> {deck.name}</span>
                  </Knop>
                </div>
              </Kaart>
              {bewerk === deck.id ? <KaartjesFormulier deck={deck} /> : null}
            </li>
          ))}
        </ul>
      )}

      {bewerk === "nieuw" ? (
        <KaartjesFormulier />
      ) : (
        <Knop variant="secundair" onClick={() => setBewerk("nieuw")} className="self-start">
          <IconPlus size={20} />
          Nieuwe stapel kaartjes
        </Knop>
      )}

      <section className="flex flex-col gap-2 rounded-[18px] bg-studio-licht px-4 py-3.5">
        <h2 className="m-0 flex items-center gap-2 text-[17px] font-extrabold">
          <IconStopwatch size={22} className="text-mosterd" />
          Alleen een timer en een teller?
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-zand">{bijElkaar("Voor spellen zonder kaartjes, zoals tekenen of raden.")}</p>
        <Knop variant="secundair" size="klein" className="self-start" onClick={() => setSpel({ deck: { id: "los", name: "Timer en teller", cards: [] }, volgorde: [] })}>
          Open de timer
        </Knop>
      </section>
    </div>
  );
}

function KaartjesFormulier({ deck }: { deck?: Deck }) {
  const [state, action, pending] = useActionState<KaartjesState, FormData>(bewaarKaartjes, {});
  const [zeker, setZeker] = useState(false);
  return (
    <Kaart className="flex flex-col gap-3">
      <h2 className="m-0 text-[19px] font-extrabold">{deck ? bijElkaar(`${deck.name} bewerken`) : "Nieuwe stapel kaartjes"}</h2>
      <form action={action} className="flex flex-col gap-3" noValidate>
        {deck ? <input type="hidden" name="id" value={deck.id} /> : null}
        <Veld label="Naam van de stapel" name="naam" defaultValue={deck?.name} maxLength={60} autoComplete="off" error={state.velden?.naam} />
        <Tekstvak
          label="Kaartjes, één per regel"
          name="kaartjes"
          rows={8}
          defaultValue={deck?.cards.join("\n")}
          placeholder={"Een kameel\nFietsband plakken\nDe Eiffeltoren"}
          hint={bijElkaar("Woorden of opdrachten. Nummers en dubbele kaartjes haalt de app zelf weg.")}
          error={state.velden?.kaartjes}
        />
        {state.fout ? <Melding tone="fout">{state.fout}</Melding> : null}
        {state.gelukt ? <Melding tone="goed">{state.gelukt}</Melding> : null}
        <Knop type="submit" disabled={pending}>
          {pending ? "Bezig met bewaren…" : "Bewaar kaartjes"}
        </Knop>
      </form>
      {deck ? (
        <form action={verwijderKaartjes} className="border-t-2 border-papier-streep pt-3">
          <input type="hidden" name="id" value={deck.id} />
          {zeker ? (
            <Knop type="submit" variant="secundair-licht" size="klein">
              Ja, verwijder {deck.name}
            </Knop>
          ) : (
            <Knop variant="secundair-licht" size="klein" onClick={() => setZeker(true)}>
              Verwijder deze stapel
            </Knop>
          )}
        </form>
      ) : null}
    </Kaart>
  );
}

function KaartjesMachine({ deck, start, onStop }: { deck: Deck; start: number[]; onStop: () => void }) {
  const [volgorde, setVolgorde] = useState(start);
  const [index, setIndex] = useState(0);
  const [geraden, setGeraden] = useState(0);
  const [verborgen, setVerborgen] = useState(false);
  const [rondes, setRondes] = useState(0);
  const metKaartjes = deck.cards.length > 0;
  const kaart = metKaartjes ? deck.cards[volgorde[index] ?? 0] : null;

  const volgende = (raden: boolean) => {
    if (raden) {
      setGeraden((g) => g + 1);
      trillen();
    }
    if (!metKaartjes) return;
    if (index + 1 >= volgorde.length) {
      setVolgorde(schud(deck.cards.length));
      setIndex(0);
      setRondes((r) => r + 1);
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="m-0 min-w-0 flex-1 text-[20px] leading-tight font-extrabold">{bijElkaar(deck.name)}</h2>
        <Knop variant="secundair" size="klein" onClick={onStop}>
          Stop
        </Knop>
      </div>

      <Timer />

      {kaart !== null ? (
        <>
          <section
            aria-label="Kaartje"
            className="op-licht relative flex min-h-[210px] flex-col items-center justify-center gap-2 rounded-kaart-groot bg-beeldbuis px-5 pt-9 pb-6 text-center text-studio shadow-kaart"
          >
            <p className="absolute top-3 left-4 m-0 text-[14px] font-bold">
              {index + 1} van {volgorde.length}
            </p>
            {verborgen ? (
              <p className="m-0 text-[19px] font-bold">Kaartje verborgen</p>
            ) : (
              <p aria-live="polite" className="m-0 text-[clamp(28px,9vw,40px)] leading-[1.15] font-extrabold">
                {bijElkaar(kaart)}
              </p>
            )}
          </section>
          {rondes > 0 && index === 0 ? (
            <p className="m-0 text-[14px] text-zand">{bijElkaar("Alle kaartjes gehad. De stapel is opnieuw geschud.")}</p>
          ) : null}
          <Knop variant="secundair" size="klein" className="self-start" aria-pressed={verborgen} onClick={() => setVerborgen((v) => !v)}>
            {verborgen ? <IconOog size={20} /> : <IconOogDicht size={20} />}
            {verborgen ? "Laat het kaartje zien" : "Verberg het kaartje"}
          </Knop>
        </>
      ) : null}

      <div className={`grid gap-2.5 ${metKaartjes ? "grid-cols-2" : "grid-cols-1"}`}>
        <Knop size="groot" onClick={() => volgende(true)}>
          Geraden
        </Knop>
        {metKaartjes ? (
          <Knop size="groot" variant="secundair" onClick={() => volgende(false)}>
            Volgende
          </Knop>
        ) : null}
      </div>

      <section aria-label="Teller" className="flex items-center gap-3 rounded-[18px] bg-studio-licht px-4 py-3">
        <span className="min-w-0 flex-1 text-[17px] font-extrabold">Geraden</span>
        <button
          type="button"
          aria-label="Eén minder geraden"
          disabled={geraden === 0}
          onClick={() => setGeraden((g) => Math.max(0, g - 1))}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-pil border-2 border-zand disabled:opacity-45"
        >
          <IconMin size={22} strokeWidth={2.6} />
        </button>
        <span className="min-w-[2.2ch] text-center font-display text-[34px] leading-none cijfers">{geraden}</span>
        <button
          type="button"
          aria-label="Eén meer geraden"
          onClick={() => setGeraden((g) => g + 1)}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-pil bg-oranje text-studio shadow-knop"
        >
          <IconPlus size={22} strokeWidth={2.6} />
        </button>
      </section>
      <button
        type="button"
        onClick={() => setGeraden(0)}
        className="min-h-11 self-start text-[15px] font-bold text-mosterd underline underline-offset-4"
      >
        Zet de teller op nul
      </button>
    </div>
  );
}

const DUREN = [30, 60, 90, 120];

function tijdTekst(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A countdown, 60 seconds unless chosen otherwise. Vibrates when time is up. */
function Timer() {
  const id = useId();
  const [duur, setDuur] = useState(60);
  const [rest, setRest] = useState(60_000);
  const [eind, setEind] = useState<number | null>(null);
  const [klok, setKlok] = useState<number | null>(null);

  useEffect(() => {
    if (eind === null) return;
    const timer = setInterval(() => {
      const now = nu();
      if (now >= eind) {
        setEind(null);
        setRest(0);
        setKlok(null);
        trillen([200, 100, 200]);
      } else {
        setKlok(now);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [eind]);

  const over = eind !== null && klok !== null ? Math.max(0, eind - klok) : rest;
  const loopt = eind !== null;
  const klaar = !loopt && rest === 0;

  const start = () => {
    const ms = rest > 0 ? rest : duur * 1000;
    setRest(ms);
    setEind(nu() + ms);
    trillen();
  };
  const pauze = () => {
    if (eind === null) return;
    setRest(Math.max(0, eind - nu()));
    setEind(null);
    setKlok(null);
  };
  const reset = (seconds = duur) => {
    setDuur(seconds);
    setEind(null);
    setKlok(null);
    setRest(seconds * 1000);
  };

  return (
    <Paneel className="flex flex-col items-center gap-3">
      <span role="timer" aria-live="off" className={`text-[56px] leading-none font-extrabold cijfers ${klaar ? "text-mosterd" : ""}`}>
        {tijdTekst(over)}
      </span>
      <p aria-live="polite" className="m-0 text-[15px] font-bold text-zand">
        {klaar ? "Tijd!" : loopt ? "De tijd loopt" : "Timer"}
      </p>
      <div className="flex w-full gap-2.5">
        {loopt ? (
          <Knop className="flex-1" onClick={pauze}>
            Pauze
          </Knop>
        ) : (
          <Knop className="flex-1" onClick={start}>
            {klaar || rest === duur * 1000 ? "Start" : "Ga verder"}
          </Knop>
        )}
        <Knop variant="secundair" onClick={() => reset()}>
          Opnieuw
        </Knop>
      </div>
      <fieldset className="m-0 flex w-full flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] text-zand" id={`${id}-duur`}>
          Hoe lang?
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {DUREN.map((seconds) => (
            <button
              key={seconds}
              type="button"
              aria-pressed={duur === seconds}
              onClick={() => reset(seconds)}
              className={`min-h-11 rounded-pil text-[15px] font-bold ${duur === seconds ? "bg-mosterd text-studio" : "border-2 border-zand text-beeldbuis"}`}
            >
              {seconds}&nbsp;s
            </button>
          ))}
        </div>
      </fieldset>
    </Paneel>
  );
}
