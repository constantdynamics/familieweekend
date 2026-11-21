"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconCamera, IconMin, IconPlus, IconSluiten, IconVinkje } from "@/components/ui/icons";
import { Tekstvak } from "@/components/ui/Invoer";
import { Melding } from "@/components/ui/Kaart";
import { Knop, KnopLink } from "@/components/ui/Knop";
import { uploadFoto } from "@/lib/client/foto";
import {
  answerText,
  cleanText,
  formatNumber,
  NUMBER_LIMIT,
  OPEN_MAX,
  sameAnswer,
  type FunfactKind,
  type FunfactValue,
} from "@/lib/shared/funfacts";
import { bijElkaar } from "@/lib/shared/tekst";
import { bewaarAntwoord } from "./actions";
import { Confetti } from "./Confetti";

export type VraagView = {
  id: string;
  kind: FunfactKind;
  text: string;
  hint: string | null;
  options: string[] | null;
  min: number | null;
  max: number | null;
};

export type AntwoordView = { value: FunfactValue | null; skipped: boolean; fotoUrl?: string | null };

type Props = {
  persoon: { id: string; naam: string };
  /** The other names on this device ("Ik vul ook in voor…"). */
  anderen: { id: string; naam: string; klaar: boolean }[];
  vragen: VraagView[];
  antwoorden: Record<string, AntwoordView>;
  klaar: boolean;
  /** "dicht": after the deadline. "bekijken": the admin views the app as someone else. */
  alleenLezen: "dicht" | "bekijken" | null;
  /** "1 april" */
  deadline: string;
};

type Stap = { soort: "start" } | { soort: "vraag"; index: number; enkel: boolean } | { soort: "klaar" };

/** What the person is typing or tapping, before it is saved. */
type Concept = boolean | string | null;

type Gelezen = { soort: "leeg" } | { soort: "waarde"; waarde: FunfactValue } | { soort: "fout"; fout: string };

function conceptUit(vraag: VraagView, antwoord: AntwoordView | undefined): Concept {
  const value = antwoord && !antwoord.skipped ? (antwoord.value as Record<string, unknown> | null) : null;
  switch (vraag.kind) {
    case "ja_nee":
      return typeof value?.bool === "boolean" ? value.bool : null;
    case "getal":
      return typeof value?.number === "number" ? String(value.number) : "";
    case "keuze":
      return typeof value?.choice === "string" ? value.choice : null;
    case "open":
      return typeof value?.text === "string" ? value.text : "";
    case "foto":
      return null;
  }
}

function lees(vraag: VraagView, concept: Concept): Gelezen {
  switch (vraag.kind) {
    case "ja_nee":
      return typeof concept === "boolean" ? { soort: "waarde", waarde: { bool: concept } } : { soort: "leeg" };
    case "keuze":
      return typeof concept === "string" && concept ? { soort: "waarde", waarde: { choice: concept } } : { soort: "leeg" };
    case "getal": {
      const tekst = typeof concept === "string" ? concept.trim() : "";
      if (!tekst) return { soort: "leeg" };
      const min = vraag.min ?? 0;
      const max = vraag.max ?? NUMBER_LIMIT;
      const getal = Number(tekst);
      if (!/^-?\d+$/.test(tekst) || getal < min || getal > max) {
        return { soort: "fout", fout: `Kies een getal van ${formatNumber(min)} tot ${formatNumber(max)}.` };
      }
      return { soort: "waarde", waarde: { number: getal } };
    }
    case "open": {
      const tekst = cleanText(typeof concept === "string" ? concept : "");
      if (!tekst) return { soort: "leeg" };
      if (tekst.length > OPEN_MAX) return { soort: "fout", fout: `Houd het korter dan ${formatNumber(OPEN_MAX)} tekens.` };
      return { soort: "waarde", waarde: { text: tekst } };
    }
    case "foto":
      return { soort: "leeg" };
  }
}

function heeftAntwoord(antwoord: AntwoordView | undefined): boolean {
  return Boolean(antwoord && !antwoord.skipped && antwoord.value);
}

/**
 * Fun facts, one question per screen (SPEC §4.2): a progress bar, "Sla
 * over", back, and every answer saved at once. Before and after the list
 * there is an overview with the person's own answers.
 */
export function Invullen({ persoon, anderen, vragen, antwoorden: begin, klaar: klaarBijBegin, alleenLezen, deadline }: Props) {
  const [antwoorden, setAntwoorden] = useState<Record<string, AntwoordView>>(begin);
  const [concepten, setConcepten] = useState<Record<string, Concept>>({});
  const [klaar, setKlaar] = useState(klaarBijBegin);
  const [stap, setStap] = useState<Stap>({ soort: "start" });
  const [bezig, setBezig] = useState(false);
  const [uploaden, setUploaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const kopRef = useRef<HTMLHeadingElement>(null);
  const focusNaWissel = useRef(false);
  const antwoordenRef = useRef(antwoorden);
  const klaarRef = useRef(klaar);

  useEffect(() => {
    antwoordenRef.current = antwoorden;
    klaarRef.current = klaar;
  }, [antwoorden, klaar]);

  // A new screen: start at the top and move the focus to its heading.
  useEffect(() => {
    if (!focusNaWissel.current) return;
    focusNaWissel.current = false;
    window.scrollTo({ top: 0 });
    kopRef.current?.focus();
  }, [stap]);

  const gaNaar = useCallback((volgende: Stap) => {
    focusNaWissel.current = true;
    setFout(null);
    setStap(volgende);
  }, []);

  const conceptVan = useCallback(
    (vraag: VraagView): Concept => (vraag.id in concepten ? concepten[vraag.id] : conceptUit(vraag, antwoorden[vraag.id])),
    [concepten, antwoorden],
  );

  const zetConcept = (vraag: VraagView, concept: Concept) => {
    setFout(null);
    setConcepten((huidig) => ({ ...huidig, [vraag.id]: concept }));
  };

  /** Save one answer; nothing is sent when it did not change. */
  const bewaar = useCallback(
    async (vraag: VraagView, waarde: FunfactValue | null, overgeslagen: boolean, fotoUrl?: string | null): Promise<{ ok: boolean; klaar: boolean }> => {
      const nieuw = { value: waarde, skipped: overgeslagen };
      if (sameAnswer(antwoordenRef.current[vraag.id], nieuw)) return { ok: true, klaar: klaarRef.current };
      setBezig(true);
      setFout(null);
      try {
        const uitkomst = await bewaarAntwoord({ deelnemer: persoon.id, vraag: vraag.id, waarde, overgeslagen });
        if (!uitkomst.ok) {
          setFout(uitkomst.fout);
          return { ok: false, klaar: klaarRef.current };
        }
        const opgeslagen: AntwoordView = { ...nieuw, fotoUrl: waarde && "upload" in waarde ? fotoUrl ?? null : null };
        antwoordenRef.current = { ...antwoordenRef.current, [vraag.id]: opgeslagen };
        setAntwoorden(antwoordenRef.current);
        setConcepten((huidig) => {
          const rest = { ...huidig };
          delete rest[vraag.id];
          return rest;
        });
        if (uitkomst.klaar) {
          klaarRef.current = true;
          setKlaar(true);
        }
        return { ok: true, klaar: uitkomst.klaar };
      } catch {
        setFout("Je antwoord is nog niet bewaard: er is geen verbinding. Probeer het nog eens als je weer internet hebt.");
        return { ok: false, klaar: klaarRef.current };
      } finally {
        setBezig(false);
      }
    },
    [persoon.id],
  );

  // The phone goes to the background (or dies): save what is typed so far.
  const stapRef = useRef(stap);
  const conceptenRef = useRef(concepten);
  useEffect(() => {
    stapRef.current = stap;
    conceptenRef.current = concepten;
  }, [stap, concepten]);
  useEffect(() => {
    if (alleenLezen) return;
    const bijVerbergen = () => {
      if (document.visibilityState !== "hidden") return;
      const huidig = stapRef.current;
      if (huidig.soort !== "vraag") return;
      const vraag = vragen[huidig.index];
      if (!vraag || !(vraag.id in conceptenRef.current)) return;
      const gelezen = lees(vraag, conceptenRef.current[vraag.id]);
      if (gelezen.soort === "waarde") void bewaar(vraag, gelezen.waarde, false);
    };
    document.addEventListener("visibilitychange", bijVerbergen);
    return () => document.removeEventListener("visibilitychange", bijVerbergen);
  }, [alleenLezen, vragen, bewaar]);

  const eersteOpen = vragen.findIndex((v) => !(v.id in antwoorden));
  const gedaan = vragen.filter((v) => v.id in antwoorden).length;

  if (stap.soort === "klaar") {
    return (
      <Klaar
        kopRef={kopRef}
        deadline={deadline}
        anderen={anderen.filter((a) => !a.klaar)}
        onOverzicht={() => gaNaar({ soort: "start" })}
      />
    );
  }

  if (stap.soort === "vraag" && vragen[stap.index]) {
    const { index, enkel } = stap;
    const vraag = vragen[index];
    const laatste = index === vragen.length - 1;

    const verder = (nuKlaar: boolean) => {
      if (enkel) return gaNaar({ soort: "start" });
      if (!laatste) return gaNaar({ soort: "vraag", index: index + 1, enkel: false });
      gaNaar(nuKlaar ? { soort: "klaar" } : { soort: "start" });
    };

    const volgende = async () => {
      if (vraag.kind === "foto") {
        if (heeftAntwoord(antwoorden[vraag.id])) return verder(klaarRef.current);
        const uitkomst = await bewaar(vraag, null, true);
        if (uitkomst.ok) verder(uitkomst.klaar);
        return;
      }
      const gelezen = lees(vraag, conceptVan(vraag));
      if (gelezen.soort === "fout") return setFout(gelezen.fout);
      const uitkomst =
        gelezen.soort === "leeg" ? await bewaar(vraag, null, true) : await bewaar(vraag, gelezen.waarde, false);
      if (uitkomst.ok) verder(uitkomst.klaar);
    };

    const slaOver = async () => {
      const uitkomst = await bewaar(vraag, null, true);
      if (uitkomst.ok) verder(uitkomst.klaar);
    };

    const vorige = async () => {
      if (enkel) return gaNaar({ soort: "start" });
      if (vraag.kind !== "foto") {
        const gelezen = lees(vraag, conceptVan(vraag));
        if (gelezen.soort === "fout") return setFout(gelezen.fout);
        if (gelezen.soort === "waarde" && !(await bewaar(vraag, gelezen.waarde, false)).ok) return;
      }
      gaNaar({ soort: "vraag", index: Math.max(0, index - 1), enkel: false });
    };

    const kiesFoto = async (bestand: File) => {
      setUploaden(true);
      setFout(null);
      try {
        const upload = await uploadFoto(bestand, "funfact", { deelnemer: persoon.id });
        if ("fout" in upload) return setFout(upload.fout);
        await bewaar(vraag, { upload: upload.id }, false, upload.url);
      } finally {
        setUploaden(false);
      }
    };

    const kopId = `vraag-${vraag.id}`;
    const knopTekst = bezig ? "Bewaren…" : enkel ? "Bewaar" : laatste ? "Rond af" : "Volgende";

    return (
      <>
        {/* The bar below replaces the menu while you answer, as in the design. */}
        <style>{`nav[aria-label="Hoofdmenu"]{display:none}`}</style>
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3 pr-[30px]">
            <button
              type="button"
              onClick={() => gaNaar({ soort: "start" })}
              aria-label="Stop en ga naar je overzicht"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-studio-licht text-beeldbuis"
            >
              <IconSluiten size={20} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[15px] font-bold">
                Vraag {index + 1} van {vragen.length}
              </span>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-pil bg-studio-licht">
                <div className="h-full rounded-pil bg-mosterd" style={{ width: `${Math.round(((index + 1) / vragen.length) * 100)}%` }} />
              </div>
            </div>
          </div>
          <p className="m-0 text-label text-zand">
            Je vult in als <strong className="text-beeldbuis">{persoon.naam}</strong>
          </p>

          <section
            key={vraag.id}
            aria-labelledby={kopId}
            className="op-licht flex flex-col gap-4 rounded-kaart-groot bg-beeldbuis p-[22px] text-studio shadow-kaart motion-safe:animate-kaart-in"
          >
            <h1 id={kopId} ref={kopRef} tabIndex={-1} className="m-0 text-[26px] leading-[1.15] font-extrabold outline-none">
              {bijElkaar(vraag.text)}
            </h1>
            {vraag.hint ? <p className="m-0 text-[15px] leading-[1.4]">{bijElkaar(vraag.hint)}</p> : null}
            <Invoer
              vraag={vraag}
              kopId={kopId}
              concept={conceptVan(vraag)}
              antwoord={antwoorden[vraag.id]}
              uploaden={uploaden}
              onConcept={(concept) => zetConcept(vraag, concept)}
              onFoto={kiesFoto}
              onEnter={() => void volgende()}
            />
          </section>

          <div aria-live="polite">{fout ? <Melding tone="fout">{fout}</Melding> : null}</div>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-studio-licht bg-studio-tab"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto flex h-20 max-w-[560px] items-center gap-2 px-4 min-[390px]:px-[22px]">
            <Knop
              variant="secundair"
              onClick={() => void vorige()}
              disabled={bezig || uploaden || (index === 0 && !enkel)}
              className="px-[18px] text-[16px]"
            >
              {enkel ? "Terug" : "Vorige"}
            </Knop>
            <button
              type="button"
              onClick={() => void slaOver()}
              disabled={bezig || uploaden}
              className="min-h-12 px-3 text-[16px] font-medium text-zand underline underline-offset-4 hover:text-beeldbuis disabled:opacity-60"
            >
              Sla over
            </button>
            <Knop onClick={() => void volgende()} disabled={bezig || uploaden} className="ml-auto px-[26px]">
              {knopTekst}
            </Knop>
          </div>
        </div>
      </>
    );
  }

  return (
    <Overzicht
      kopRef={kopRef}
      persoon={persoon}
      anderen={anderen}
      vragen={vragen}
      antwoorden={antwoorden}
      klaar={klaar}
      gedaan={gedaan}
      eersteOpen={eersteOpen}
      alleenLezen={alleenLezen}
      deadline={deadline}
      onStart={(index, enkel) => gaNaar({ soort: "vraag", index, enkel })}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* The input per kind of question                                            */
/* ------------------------------------------------------------------------ */

type InvoerProps = {
  vraag: VraagView;
  kopId: string;
  concept: Concept;
  antwoord: AntwoordView | undefined;
  uploaden: boolean;
  onConcept: (concept: Concept) => void;
  onFoto: (bestand: File) => void;
  onEnter: () => void;
};

const tegel =
  "inline-flex items-center justify-center gap-2 border-[3px] border-studio text-studio transition-transform duration-150 active:translate-y-px";

function Invoer({ vraag, kopId, concept, antwoord, uploaden, onConcept, onFoto, onEnter }: InvoerProps) {
  const hintId = useId();
  const fotoId = useId();

  if (vraag.kind === "ja_nee") {
    return (
      <div role="group" aria-labelledby={kopId} className="grid grid-cols-2 gap-3">
        {[true, false].map((ja) => {
          const gekozen = concept === ja;
          return (
            <button
              key={String(ja)}
              type="button"
              aria-pressed={gekozen}
              onClick={() => onConcept(gekozen ? null : ja)}
              className={`${tegel} min-h-16 rounded-[18px] text-[20px] font-extrabold ${gekozen ? "bg-oranje" : "bg-papier"}`}
            >
              {gekozen ? <IconVinkje size={20} /> : null}
              {ja ? "Ja" : "Nee"}
            </button>
          );
        })}
      </div>
    );
  }

  if (vraag.kind === "keuze") {
    return (
      <div role="group" aria-labelledby={kopId} className="flex flex-wrap gap-2.5">
        {(vraag.options ?? []).map((optie) => {
          const gekozen = concept === optie;
          return (
            <button
              key={optie}
              type="button"
              aria-pressed={gekozen}
              onClick={() => onConcept(gekozen ? null : optie)}
              className={`${tegel} min-h-12 rounded-pil px-4 text-left text-[16px] font-bold ${gekozen ? "bg-oranje" : "bg-papier"}`}
            >
              {gekozen ? <IconVinkje size={18} /> : null}
              {optie}
            </button>
          );
        })}
      </div>
    );
  }

  if (vraag.kind === "getal") {
    const min = vraag.min ?? 0;
    const max = vraag.max ?? NUMBER_LIMIT;
    const tekst = typeof concept === "string" ? concept : "";
    const getal = /^-?\d+$/.test(tekst.trim()) ? Number(tekst) : null;
    const zet = (n: number) => onConcept(String(Math.min(max, Math.max(min, n))));
    const cijfers = tekst.replace("-", "").length;
    const grootte = cijfers <= 3 ? "text-[60px]" : cijfers === 4 ? "text-[50px]" : "text-[40px]";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            aria-label="Eén minder"
            onClick={() => zet(getal === null ? min : getal - 1)}
            disabled={getal !== null && getal <= min}
            className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-pil bg-studio text-beeldbuis active:translate-y-px disabled:opacity-40"
          >
            <IconMin size={24} strokeWidth={3} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            aria-labelledby={kopId}
            aria-describedby={hintId}
            value={tekst}
            placeholder="?"
            onChange={(event) => onConcept(event.target.value.replace(/[^\d-]/g, "").slice(0, 7))}
            onKeyDown={(event) => {
              if (event.key === "Enter") onEnter();
            }}
            className={`h-[76px] w-full min-w-0 rounded-tegel bg-transparent text-center font-display leading-none text-studio cijfers placeholder:text-[#8a6a55] ${grootte}`}
          />
          <button
            type="button"
            aria-label="Eén meer"
            onClick={() => zet(getal === null ? min : getal + 1)}
            disabled={getal !== null && getal >= max}
            className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-pil bg-oranje text-studio shadow-knop active:translate-y-px disabled:opacity-40"
          >
            <IconPlus size={24} strokeWidth={3} />
          </button>
        </div>
        <p id={hintId} className="m-0 text-center text-label">
          {max - min > 50 ? "Tik op het getal om het te typen. " : ""}
          {bijElkaar(`Van ${formatNumber(min)} tot ${formatNumber(max)}.`)}
        </p>
      </div>
    );
  }

  if (vraag.kind === "open") {
    return (
      <Tekstvak
        label="Jouw antwoord"
        rows={3}
        maxLength={OPEN_MAX}
        value={typeof concept === "string" ? concept : ""}
        onChange={(event) => onConcept(event.target.value)}
      />
    );
  }

  // foto
  const foto = heeftAntwoord(antwoord) ? antwoord?.fotoUrl : null;
  return (
    <div className="flex flex-col gap-3">
      {foto ? (
        // A signed link that expires: no image optimisation for this one.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="Jouw foto" className="max-h-[260px] w-full rounded-[18px] border-[3px] border-studio object-cover" />
      ) : null}
      <label
        htmlFor={fotoId}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-[3px] border-dashed border-studio bg-papier p-3 text-center focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-studio ${
          foto ? "min-h-[64px]" : "min-h-[150px]"
        }`}
      >
        {foto ? null : <IconCamera size={40} />}
        <span className="text-[17px] font-extrabold" aria-live="polite">
          {uploaden ? "Bezig met uploaden…" : foto ? "Kies een andere foto" : "Kies een foto"}
        </span>
        <span className="text-label">Alleen de organisatie ziet je foto</span>
        <input
          id={fotoId}
          type="file"
          accept="image/*"
          disabled={uploaden}
          aria-describedby={kopId}
          className="sr-only"
          onChange={(event) => {
            const bestand = event.target.files?.[0];
            event.target.value = "";
            if (bestand) onFoto(bestand);
          }}
        />
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The overview: start, carry on, or change an answer                        */
/* ------------------------------------------------------------------------ */

type OverzichtProps = {
  kopRef: React.RefObject<HTMLHeadingElement | null>;
  persoon: { id: string; naam: string };
  anderen: { id: string; naam: string; klaar: boolean }[];
  vragen: VraagView[];
  antwoorden: Record<string, AntwoordView>;
  klaar: boolean;
  gedaan: number;
  eersteOpen: number;
  alleenLezen: "dicht" | "bekijken" | null;
  deadline: string;
  onStart: (index: number, enkel: boolean) => void;
};

function Overzicht(props: OverzichtProps) {
  const { kopRef, persoon, anderen, vragen, antwoorden, klaar, gedaan, eersteOpen, alleenLezen, deadline, onStart } = props;
  const kanAanpassen = alleenLezen === null;
  const begonnen = gedaan > 0;
  const toonLijst = begonnen || klaar || alleenLezen === "dicht";

  let kaart: ReactNode;
  if (alleenLezen === "dicht") {
    kaart = (
      <>
        <Melding tone="info">De lijst is gesloten, dank je wel!</Melding>
        <p className="m-0 text-[15px] leading-[1.45]">
          {begonnen ? "Hieronder zie je wat je hebt ingevuld. Alleen de organisatie ziet het." : "Je hebt niets ingevuld. Geen nood: in de quiz doe je gewoon mee."}
        </p>
      </>
    );
  } else if (alleenLezen === "bekijken") {
    kaart = <Melding tone="info">Je bekijkt de app als iemand anders. Invullen kan dan niet.</Melding>;
  } else if (klaar && eersteOpen === -1) {
    kaart = (
      <>
        <h2 className="m-0 flex items-center gap-2 text-[20px] leading-tight font-extrabold">
          <IconVinkje size={22} className="flex-none text-avocado" />
          Je bent klaar!
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          {bijElkaar(`Dank je wel. Tot ${deadline} kun je nog dingen aanpassen: tik op een antwoord.`)}
        </p>
      </>
    );
  } else if (begonnen) {
    kaart = (
      <>
        <h2 className="m-0 text-[20px] leading-tight font-extrabold">Je bent goed op weg</h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          {gedaan} van de {vragen.length} vragen gedaan. Alles is al bewaard.
        </p>
        <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pil bg-papier-streep">
          <div className="h-full rounded-pil bg-oranje" style={{ width: `${Math.round((gedaan / Math.max(1, vragen.length)) * 100)}%` }} />
        </div>
        <Knop size="groot" className="w-full" onClick={() => onStart(Math.max(0, eersteOpen), false)}>
          Ga verder met vraag {Math.max(0, eersteOpen) + 1}
        </Knop>
      </>
    );
  } else {
    kaart = (
      <>
        <h2 className="m-0 text-[20px] leading-tight font-extrabold">{vragen.length} luchtige vragen voor de quiz</h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          Eén vraag per scherm. Overslaan mag altijd, terug kan ook, en elk antwoord wordt meteen bewaard.
        </p>
        <p className="m-0 text-[15px] leading-[1.45] font-bold">Alleen de organisatie ziet je antwoorden.</p>
        <Knop size="groot" className="w-full" onClick={() => onStart(0, false)}>
          Begin met vraag 1
        </Knop>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 pr-10">
        <h1 ref={kopRef} tabIndex={-1} className="m-0 font-display text-[30px] leading-[1.1] font-normal outline-none schaduw-oranje">
          Je fun facts
        </h1>
        <p className="m-0 text-[15px] text-zand">
          {alleenLezen === "dicht" ? "Ingevuld door" : "Je vult in als"} <strong className="text-beeldbuis">{persoon.naam}</strong>
        </p>
      </div>

      <section className="op-licht flex flex-col gap-3 rounded-kaart bg-beeldbuis p-[18px] text-studio shadow-kaart">
        {kaart}
        {kanAanpassen && !(klaar && eersteOpen === -1) ? (
          <p className="m-0 text-label font-medium">{bijElkaar(`Invullen kan tot ${deadline}.`)}</p>
        ) : null}
      </section>

      {anderen.length > 0 || kanAanpassen ? (
        <nav aria-label="Andere namen" className="flex flex-col gap-2">
          {anderen.length > 0 ? (
            <>
              <p className="m-0 text-[15px] font-bold text-zand">Op deze telefoon ook:</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {anderen.map((ander) => (
                  <li key={ander.id}>
                    <Link
                      href={`/funfacts?voor=${ander.id}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-pil bg-studio-licht px-4 text-[15px] font-bold text-beeldbuis no-underline hover:text-beeldbuis"
                    >
                      {ander.klaar ? <IconVinkje size={16} className="text-avocado-licht" /> : null}
                      {ander.naam}
                      <span className="sr-only">{ander.klaar ? "(klaar)" : "(nog niet klaar)"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {kanAanpassen ? (
            <Link
              href="/wie-ben-jij?terug=/funfacts"
              className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-mosterd underline underline-offset-4"
            >
              Ik vul ook in voor…
            </Link>
          ) : null}
        </nav>
      ) : null}

      {toonLijst ? (
        <section aria-labelledby="mijn-antwoorden" className="flex flex-col gap-2.5">
          <h2 id="mijn-antwoorden" className="m-0 mt-2 font-display text-[24px] font-normal schaduw-oranje">
            Jouw antwoorden
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {vragen.map((vraag, index) => {
              const antwoord = antwoorden[vraag.id];
              const inhoud = (
                <>
                  <span className="text-label text-zand">Vraag {index + 1}</span>
                  <span className="text-[16px] leading-snug font-bold">{bijElkaar(vraag.text)}</span>
                  {vraag.kind === "foto" && heeftAntwoord(antwoord) && antwoord?.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={antwoord.fotoUrl} alt="Jouw foto" className="mt-1 h-24 w-32 rounded-tegel border-2 border-zand object-cover" />
                  ) : (
                    <span className={`text-[16px] leading-snug ${heeftAntwoord(antwoord) ? "text-mosterd" : "text-zand italic"}`}>
                      {bijElkaar(answerText(vraag, antwoord))}
                    </span>
                  )}
                </>
              );
              return (
                <li key={vraag.id} className="flex">
                  {kanAanpassen ? (
                    <button
                      type="button"
                      onClick={() => onStart(index, true)}
                      className="flex min-h-[56px] flex-1 flex-col items-start gap-0.5 rounded-[16px] bg-studio-licht px-4 py-3 text-left text-beeldbuis hover:bg-studio-rand"
                    >
                      {inhoud}
                      <span className="mt-1 text-label font-bold text-zand underline underline-offset-4">Pas aan</span>
                    </button>
                  ) : (
                    <div className="flex flex-1 flex-col items-start gap-0.5 rounded-[16px] bg-studio-licht px-4 py-3">{inhoud}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Klaar, dank je wel!                                                       */
/* ------------------------------------------------------------------------ */

function Klaar({
  kopRef,
  deadline,
  anderen,
  onOverzicht,
}: {
  kopRef: React.RefObject<HTMLHeadingElement | null>;
  deadline: string;
  anderen: { id: string; naam: string }[];
  onOverzicht: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 pt-5">
      <div className="relative">
        <span className="flex h-[84px] w-[84px] items-center justify-center rounded-pil bg-mosterd text-studio shadow-[0_5px_0_#9E6A0B]">
          <IconVinkje size={44} />
        </span>
        <Confetti />
      </div>
      <h1 ref={kopRef} tabIndex={-1} className="m-0 font-display text-[34px] leading-[1.1] font-normal outline-none schaduw-oranje">
        Klaar, dank je wel!
      </h1>
      <p className="m-0 text-[17px] leading-[1.45]">
        {bijElkaar(`Je antwoorden zijn bewaard. Alleen de organisatie ziet ze, en tot ${deadline} kun je nog dingen aanpassen.`)}
      </p>
      <div className="flex flex-wrap gap-3">
        <KnopLink href="/">Terug naar Thuis</KnopLink>
        <Knop variant="secundair" onClick={onOverzicht}>
          Bekijk je antwoorden
        </Knop>
      </div>
      {anderen.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="m-0 text-[15px] font-bold text-zand">Vul je ook in voor iemand anders?</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {anderen.map((ander) => (
              <li key={ander.id}>
                <KnopLink href={`/funfacts?voor=${ander.id}`} variant="secundair" size="klein">
                  Vul in voor {ander.naam}
                </KnopLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
