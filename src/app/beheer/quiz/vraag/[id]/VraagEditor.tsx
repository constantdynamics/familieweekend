"use client";

import { useActionState, useState } from "react";
import { SOORT_LABEL, SOORT_UITLEG } from "@/components/quiz/soorten";
import { TILE } from "@/components/quiz/tegelKleuren";
import { IconCamera, IconPrullenbak } from "@/components/ui/icons";
import { Keuzelijst, Tekstvak } from "@/components/ui/Invoer";
import { Kaart, Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { Veld } from "@/components/ui/Veld";
import { uploadFoto } from "@/lib/client/foto";
import type { QuestionType } from "@/lib/server/quiz/types";
import { plekUitLink } from "@/lib/shared/kaartlink";
import { bijElkaar } from "@/lib/shared/tekst";
import { bewaarVraag, leesKaartLink, verwijderVraag, type QuizState } from "../../actions";

export type VraagWaarden = {
  soort: QuestionType;
  vraag: string;
  opties: string[];
  goedKeuze: string;
  goedWaar: string;
  goedEcht: string;
  goedGetal: string;
  eenheid: string;
  lat: string;
  lng: string;
  schaal: string;
  uitleg: string;
  notitie: string;
  onderwerp: string;
  foto: string;
  fotoUrl: string | null;
  /** The photos after the first, for a map question with several views of the same place. */
  extraFotos: { id: string; url: string }[];
  fotobron: string;
  idBestand: string;
};

/** A map question shows at most this many photos of the same place. */
const MAX_FOTOS = 5;

/** A fun-fact photo the admin picked for Echt of AI, in the version that goes into the quiz. */
export type FotoKeuze = { id: string; label: string; url: string; goed: "echt" | "ai" };

const SOORTEN = Object.keys(SOORT_LABEL) as QuestionType[];
const LETTERS = ["A", "B", "C", "D"];

/** The question editor in beheer: small changes, photos, and the reminder for young and old. */
export function VraagEditor({
  ronde,
  id,
  begin,
  automatisch,
  fotoKeuzes,
}: {
  ronde: string;
  id: string | null;
  begin: VraagWaarden;
  automatisch: string[];
  fotoKeuzes: FotoKeuze[];
}) {
  const [state, action, pending] = useActionState<QuizState, FormData>(bewaarVraag, {});
  const [weg, wegAction, wegBezig] = useActionState<QuizState, FormData>(verwijderVraag, {});
  const [w, setW] = useState<VraagWaarden>(begin);
  const [uploaden, setUploaden] = useState(false);
  const [fotoFout, setFotoFout] = useState<string | null>(null);
  const [kaartLink, setKaartLink] = useState("");
  const [linkBezig, setLinkBezig] = useState(false);
  const [linkMelding, setLinkMelding] = useState<{ tone: "goed" | "fout"; tekst: string } | null>(null);
  const [zeker, setZeker] = useState(false);
  const velden = state.velden ?? {};
  const zet = <K extends keyof VraagWaarden>(key: K, value: VraagWaarden[K]) => setW((oud) => ({ ...oud, [key]: value }));
  const keuze = w.soort === "meerkeuze" || w.soort === "wie_van_ons" || w.soort === "schatting_bereik";
  // Echt of AI with a fun-fact photo: the right answer follows from the photo admin.
  const funfactFoto = w.soort === "echt_of_ai" ? fotoKeuzes.find((foto) => foto.id === w.foto) : undefined;
  const kaart = w.soort === "kaart";
  const fotos = w.fotoUrl ? [{ id: w.foto, url: w.fotoUrl }, ...(kaart ? w.extraFotos : [])] : [];

  /** The place from a pasted Street View or Maps link; a short link from the Maps app goes via the server. */
  async function zetPlek() {
    setLinkMelding(null);
    const direct = plekUitLink(kaartLink);
    let plek = direct;
    if (!plek) {
      setLinkBezig(true);
      const result = await leesKaartLink(kaartLink);
      setLinkBezig(false);
      if ("fout" in result) {
        setLinkMelding({ tone: "fout", tekst: result.fout });
        return;
      }
      plek = result.plek;
    }
    setW((oud) => ({ ...oud, lat: String(plek.lat), lng: String(plek.lng) }));
    setLinkMelding({ tone: "goed", tekst: `Plek gezet: ${plek.lat}, ${plek.lng}.` });
  }

  /** One or more chosen photos: the first becomes the photo, at a map question the rest are added. */
  async function kiesFotos(files: File[]) {
    setFotoFout(null);
    // A map question takes photos up to MAX_FOTOS; only those that still fit are uploaded.
    const ruimte = kaart ? MAX_FOTOS - fotos.length : 1;
    const gekozen = files.slice(0, Math.max(0, ruimte));
    if (gekozen.length === 0) {
      setFotoFout(`Hoogstens ${MAX_FOTOS} foto's bij een kaartvraag.`);
      return;
    }
    setUploaden(true);
    try {
      for (const file of gekozen) {
        const result = await uploadFoto(file, "quiz");
        if ("fout" in result) {
          setFotoFout(result.fout);
          return;
        }
        setW((oud) =>
          !oud.foto || oud.soort !== "kaart"
            ? { ...oud, foto: result.id, fotoUrl: result.url }
            : { ...oud, extraFotos: [...oud.extraFotos, { id: result.id, url: result.url }].slice(0, MAX_FOTOS - 1) },
        );
      }
      if (gekozen.length < files.length) {
        setFotoFout(
          `Hoogstens ${MAX_FOTOS} foto's bij een kaartvraag, dus ${gekozen.length === 1 ? "de eerste is" : `de eerste ${gekozen.length} zijn`} toegevoegd.`,
        );
      }
    } finally {
      setUploaden(false);
    }
  }

  /** Remove photo `index`; when the first goes, the next one moves up. */
  function haalFotoWeg(index: number) {
    setW((oud) => {
      if (index > 0) return { ...oud, extraFotos: oud.extraFotos.filter((_, i) => i !== index - 1) };
      const [volgende, ...rest] = oud.extraFotos;
      return volgende
        ? { ...oud, foto: volgende.id, fotoUrl: volgende.url, extraFotos: rest }
        : { ...oud, foto: "", fotoUrl: null, extraFotos: [] };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 rounded-[18px] bg-mosterd px-4 py-3 text-[16px] leading-[1.4] font-extrabold text-studio">
        {bijElkaar("Kan een kind van 10 dit beredeneren? Gezond verstand moet genoeg zijn, ook zonder parate kennis.")}
      </p>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="ronde" value={ronde} />
        <input type="hidden" name="id" value={id ?? ""} />
        <input type="hidden" name="foto" value={w.foto} />
        <input type="hidden" name="extra_fotos" value={kaart ? w.extraFotos.map((foto) => foto.id).join(",") : ""} />
        <input type="hidden" name="id_bestand" value={w.idBestand} />
        <Kaart className="flex flex-col gap-3">
          <Keuzelijst
            label="Soort vraag"
            name="soort"
            value={w.soort}
            onChange={(event) => zet("soort", event.target.value as QuestionType)}
            hint={bijElkaar(SOORT_UITLEG[w.soort])}
            error={velden.soort}
          >
            {SOORTEN.map((soort) => (
              <option key={soort} value={soort}>
                {SOORT_LABEL[soort]}
              </option>
            ))}
          </Keuzelijst>
          <Tekstvak label="Vraag" name="vraag" rows={3} value={w.vraag} onChange={(event) => zet("vraag", event.target.value)} error={velden.vraag} maxLength={300} />
        </Kaart>

        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">Het goede antwoord</h2>
          {keuze ? (
            <>
              {LETTERS.map((letter, index) => (
                <div key={letter} className="flex items-end gap-2.5">
                  <span aria-hidden="true" className={`mb-2.5 h-8 w-8 flex-none rounded-[8px] ${TILE[index]}`} />
                  <Veld
                    label={`Antwoord ${letter}${index >= 2 ? " (mag leeg)" : ""}`}
                    name={`optie${index}`}
                    value={w.opties[index] ?? ""}
                    onChange={(event) => zet("opties", w.opties.map((oud, i) => (i === index ? event.target.value : oud)))}
                    maxLength={80}
                    autoComplete="off"
                    className="flex-1"
                  />
                </div>
              ))}
              {velden.opties ? <p className="m-0 text-label font-bold text-roest">{velden.opties}</p> : null}
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[15px] font-bold">Welk antwoord is goed?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {LETTERS.map((letter, index) => (
                    <label key={letter} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand">
                      <input
                        type="radio"
                        name="goed_keuze"
                        value={String(index)}
                        checked={w.goedKeuze === String(index)}
                        onChange={() => zet("goedKeuze", String(index))}
                        className="h-5 w-5 accent-oranje"
                      />
                      <span className="text-[16px] font-bold">{bijElkaar(`Antwoord ${letter}`)}</span>
                    </label>
                  ))}
                </div>
                {velden.goed ? <p className="m-0 text-label font-bold text-roest">{velden.goed}</p> : null}
              </fieldset>
              {w.soort === "wie_van_ons" ? (
                <p className="m-0 text-label leading-[1.4]">Namen precies zoals in de deelnemerslijst, liefst één per team.</p>
              ) : null}
            </>
          ) : funfactFoto ? (
            <>
              <input type="hidden" name="goed_echt" value={funfactFoto.goed} />
              <p className="m-0 text-[16px] leading-[1.45] font-bold">
                {bijElkaar(
                  `${funfactFoto.goed === "ai" ? "AI" : "Echt"}: dat volgt uit het fotobeheer van de fun facts. Kies je daar een andere versie, dan verandert het goede antwoord vanzelf mee.`,
                )}
              </p>
            </>
          ) : w.soort === "waar_niet_waar" || w.soort === "echt_of_ai" ? (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[15px] font-bold">Wat is goed?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(w.soort === "waar_niet_waar"
                  ? [
                      ["waar", "Waar"],
                      ["niet_waar", "Niet waar"],
                    ]
                  : [
                      ["echt", "Echt"],
                      ["ai", "AI"],
                    ]
                ).map(([value, label]) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand">
                    <input
                      type="radio"
                      name={w.soort === "waar_niet_waar" ? "goed_waar" : "goed_echt"}
                      value={value}
                      checked={(w.soort === "waar_niet_waar" ? w.goedWaar : w.goedEcht) === value}
                      onChange={() => zet(w.soort === "waar_niet_waar" ? "goedWaar" : "goedEcht", value)}
                      className="h-5 w-5 accent-oranje"
                    />
                    <span className="text-[16px] font-bold">{label}</span>
                  </label>
                ))}
              </div>
              {velden.goed ? <p className="m-0 text-label font-bold text-roest">{velden.goed}</p> : null}
            </fieldset>
          ) : w.soort === "schatting" ? (
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Goed getal" name="goed_getal" inputMode="decimal" value={w.goedGetal} onChange={(event) => zet("goedGetal", event.target.value)} error={velden.goed} autoComplete="off" />
              <Veld label="Eenheid" name="eenheid" value={w.eenheid} onChange={(event) => zet("eenheid", event.target.value)} error={velden.eenheid} placeholder="dagen" autoComplete="off" maxLength={30} />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Veld
                  label="Street View-link"
                  value={kaartLink}
                  onChange={(event) => setKaartLink(event.target.value)}
                  hint={bijElkaar("Plak de link van de plek waar je de foto's maakte. De link uit de Maps-app op je telefoon werkt ook.")}
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://www.google.com/maps/@52.36913,4.90522,3a,…"
                />
                <Knop type="button" size="klein" variant="secundair-licht" className="self-start" disabled={!kaartLink.trim() || linkBezig} onClick={() => void zetPlek()}>
                  {linkBezig ? "Even kijken…" : "Zet de plek uit de link"}
                </Knop>
                {linkMelding ? <Melding tone={linkMelding.tone}>{bijElkaar(linkMelding.tekst)}</Melding> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Veld label="Breedtegraad" name="lat" inputMode="decimal" value={w.lat} onChange={(event) => zet("lat", event.target.value)} autoComplete="off" />
                <Veld label="Lengtegraad" name="lng" inputMode="decimal" value={w.lng} onChange={(event) => zet("lng", event.target.value)} autoComplete="off" />
              </div>
              {velden.goed ? <p className="m-0 text-label font-bold text-roest">{velden.goed}</p> : null}
              <p className="m-0 text-label leading-[1.4]">
                {bijElkaar("Of typ ze over, bijvoorbeeld 50,865 en 5,832 voor Valkenburg aan de Geul. Controleer de plek op een kaart.")}
              </p>
              <p className="m-0 text-label leading-[1.4] font-bold">
                {bijElkaar("Tip: zet in een kaartronde de makkelijkste plek eerst en de moeilijkste als laatste.")}
              </p>
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[15px] font-bold">Schaal</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["nederland", "Nederland"],
                    ["wereld", "Wereld"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-tegel border-[3px] border-studio bg-papier px-3 has-checked:bg-zand">
                      <input type="radio" name="schaal" value={value} checked={w.schaal === value} onChange={() => zet("schaal", value)} className="h-5 w-5 accent-oranje" />
                      <span className="text-[16px] font-bold">{label}</span>
                    </label>
                  ))}
                </div>
                <p className="m-0 text-label leading-[1.4]">
                  {bijElkaar(
                    "Nederland: 3 punten tot 5 km, 2 tot 20 km, 1 tot 75 km. Wereld: 3 punten tot 100 km, 2 tot 500 km, 1 tot 1500 km.",
                  )}
                </p>
                {velden.schaal ? <p className="m-0 text-label font-bold text-roest">{velden.schaal}</p> : null}
              </fieldset>
            </>
          )}
        </Kaart>

        <Kaart className="flex flex-col gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">Foto</h2>
          {w.soort === "echt_of_ai" && fotoKeuzes.length > 0 ? (
            <Keuzelijst
              label="Foto uit de fun facts"
              value={funfactFoto?.id ?? ""}
              hint={bijElkaar("De foto's waarvoor je in het fotobeheer een versie voor de quiz koos.")}
              onChange={(event) => {
                const foto = fotoKeuzes.find((keuze) => keuze.id === event.target.value);
                if (foto) setW((oud) => ({ ...oud, foto: foto.id, fotoUrl: foto.url, goedEcht: foto.goed, fotobron: "" }));
                else setW((oud) => ({ ...oud, foto: "", fotoUrl: null }));
              }}
            >
              <option value="">Geen, ik upload zelf een foto</option>
              {fotoKeuzes.map((foto) => (
                <option key={foto.id} value={foto.id}>
                  {foto.label}
                </option>
              ))}
            </Keuzelijst>
          ) : null}
          {fotos.length > 1 ? (
            <>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
                {fotos.map((foto, index) => (
                  <li key={foto.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={foto.url}
                      alt={`Foto ${index + 1} bij deze vraag`}
                      className="aspect-[10/7] w-full rounded-tegel bg-papier-streep object-contain"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 left-1.5 flex h-7 min-w-7 items-center justify-center rounded-pil border-2 border-papier bg-studio px-2 text-[14px] font-extrabold text-papier"
                    >
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Haal foto ${index + 1} weg`}
                      className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-pil border-2 border-papier bg-studio text-papier shadow-kaart"
                      onClick={() => haalFotoWeg(index)}
                    >
                      <IconPrullenbak size={20} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[15px] leading-[1.45]">
                {bijElkaar("De teams zien de foto's in deze volgorde. Met de prullenbak haal je er een weg.")}
              </p>
            </>
          ) : fotos.length === 1 ? (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotos[0].url} alt="De foto bij deze vraag" className="max-h-[240px] w-full rounded-tegel bg-papier-streep object-contain" />
              <Knop type="button" size="klein" variant="secundair-licht" className="self-start" onClick={() => haalFotoWeg(0)}>
                <IconPrullenbak size={18} />
                Haal de foto weg
              </Knop>
            </div>
          ) : (
            <p className="m-0 text-[15px] leading-[1.45]">
              {bijElkaar(
                w.soort === "kaart"
                  ? "Bij een kaartvraag zoals GeoGuessr: een of meer Street View-foto's van dezelfde plek (tot 5), en de captain zet een speld waar ze gemaakt zijn."
                  : w.soort === "echt_of_ai"
                    ? "Bij Echt of AI hoort altijd een foto."
                    : "Een foto mag, bijvoorbeeld een babyfoto.",
              )}
            </p>
          )}
          {kaart && fotos.length >= MAX_FOTOS ? (
            <p className="m-0 text-[15px] leading-[1.45] font-bold">
              {bijElkaar(`Dit zijn er ${MAX_FOTOS}, meer kan niet. Haal er een weg om een andere te kiezen.`)}
            </p>
          ) : (
            <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 self-start rounded-pil border-2 border-studio px-[22px] text-[17px] font-bold">
              <IconCamera size={20} />
              {uploaden
                ? "Bezig met uploaden…"
                : !w.fotoUrl
                  ? kaart
                    ? "Kies een of meer foto's"
                    : "Kies een foto"
                  : kaart
                    ? "Voeg foto's toe"
                    : "Kies een andere foto"}
              <input
                type="file"
                accept="image/*"
                multiple={kaart}
                className="sr-only"
                disabled={uploaden}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length > 0) void kiesFotos(kaart ? files : files.slice(0, 1));
                }}
              />
            </label>
          )}
          {fotoFout ? <Melding tone="fout">{bijElkaar(fotoFout)}</Melding> : null}
          {velden.foto ? <Melding tone="fout">{bijElkaar(velden.foto)}</Melding> : null}
          {w.foto ? (
            <Veld
              label="Bron van de foto"
              name="fotobron"
              value={w.fotobron}
              onChange={(event) => zet("fotobron", event.target.value)}
              hint={bijElkaar("Bijvoorbeeld: foto van Oom Kees. Staat klein onder de foto.")}
              error={velden.fotobron}
              maxLength={120}
              autoComplete="off"
            />
          ) : null}
        </Kaart>

        <Kaart className="flex flex-col gap-3">
          <Tekstvak
            label="Uitleg bij de onthulling"
            name="uitleg"
            rows={3}
            value={w.uitleg}
            onChange={(event) => zet("uitleg", event.target.value)}
            error={velden.uitleg}
            hint={bijElkaar("Verschijnt op alle telefoons als het antwoord onthuld is.")}
            maxLength={600}
          />
          <Veld
            label="Notitie voor de quizmaster"
            name="notitie"
            value={w.notitie}
            onChange={(event) => zet("notitie", event.target.value)}
            error={velden.notitie}
            hint={bijElkaar("Alleen jij ziet dit, bijvoorbeeld: Start op Spotify playlist Quiz ronde 3, nummer 2.")}
            maxLength={300}
            autoComplete="off"
          />
          <Veld
            label="Voorkennis (namen)"
            name="onderwerp"
            value={w.onderwerp}
            onChange={(event) => zet("onderwerp", event.target.value)}
            error={velden.onderwerp}
            hint={bijElkaar(
              automatisch.length > 0
                ? `Komma's ertussen. Vanzelf erbij: ${automatisch.join(", ")}.`
                : "Wie het antwoord al weet, met komma's ertussen. Bij wie van ons en Echt of AI vult de app dit zelf in.",
            )}
            autoComplete="off"
          />
        </Kaart>

        {state.fout ? <Melding tone="fout">{bijElkaar(state.fout)}</Melding> : null}
        <Knop type="submit" size="groot" disabled={pending || uploaden}>
          {pending ? "Bezig met bewaren…" : "Bewaar de vraag"}
        </Knop>
      </form>

      {id ? (
        <div className="flex flex-col gap-2">
          {weg.fout ? <Melding tone="fout">{bijElkaar(weg.fout)}</Melding> : null}
          {zeker ? (
            <form action={wegAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={id} />
              <Knop type="submit" size="klein" disabled={wegBezig}>
                Ja, verwijder deze vraag
              </Knop>
              <Knop type="button" size="klein" variant="secundair" onClick={() => setZeker(false)}>
                Nee, laat staan
              </Knop>
            </form>
          ) : (
            <Knop type="button" variant="secundair" className="self-start" onClick={() => setZeker(true)}>
              Verwijder deze vraag
            </Knop>
          )}
        </div>
      ) : null}
    </div>
  );
}
