"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { IconFoto, IconSluiten } from "@/components/ui/icons";
import { Keuzelijst, Tekstvak } from "@/components/ui/Invoer";
import { Melding } from "@/components/ui/Kaart";
import { Knop } from "@/components/ui/Knop";
import { BOARD, STAFF_AS, bodyProblem, cleanBody, type FeedPhoto } from "@/lib/shared/board";
import { bijElkaar } from "@/lib/shared/tekst";
import { uploadBoardPhoto } from "./upload";

type Photo = { key: string; id: string | null; url: string; local: boolean };

export type ComposerResult = { ok: true } | { fout: string };

type Mode = "nieuw" | "reactie" | "bewerk";

const TEKST: Record<Mode, { label: string; placeholder?: string; knop: string; bezig: string }> = {
  nieuw: {
    label: "Je bericht",
    placeholder: "Doe de groeten, deel een herinnering of schep lekker op.",
    knop: "Plaats bericht",
    bezig: "Bezig met plaatsen…",
  },
  reactie: { label: "Je reactie", placeholder: "Schrijf een reactie", knop: "Plaats reactie", bezig: "Bezig met plaatsen…" },
  bewerk: { label: "Bewerk het bericht", knop: "Bewaar bericht", bezig: "Bezig met bewaren…" },
};

type Props = {
  mode: Mode;
  /** Who posts: a name on this phone, or "De spelleiding". Photos are uploaded for them. */
  author: { id: string; name: string };
  /** Everyone this phone may post as here; more than one gives "Plaats als". */
  authors?: { id: string; name: string }[];
  onAuthorChange?: (id: string) => void;
  initialText?: string;
  initialPhotos?: FeedPhoto[];
  onSubmit: (input: { tekst: string; fotos: string[] }) => Promise<ComposerResult>;
  /** After a good submit (the composer is empty again, except when editing). */
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
  label?: string;
  /** Extra fields above the text, such as the channel in beheer. */
  children?: ReactNode;
};

/**
 * Write a post, a reply, or change one: text and at most four photos. The
 * photos go up (made smaller) as soon as they are chosen, so posting is
 * quick. Text is checked here and again on the server.
 */
export function Composer({
  mode,
  author,
  authors = [],
  onAuthorChange,
  initialText = "",
  initialPhotos = [],
  onSubmit,
  onDone,
  onCancel,
  label,
  children,
}: Props) {
  const tekst = TEKST[mode];
  const [text, setText] = useState(initialText);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    initialPhotos.map((p) => ({ key: p.id, id: p.id, url: p.url, local: false })),
  );
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const previews = useRef(new Set<string>());

  // Free the local previews when the composer goes away.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  async function addFiles(list: FileList | null) {
    const files = list ? [...list] : [];
    if (fileInput.current) fileInput.current.value = "";
    if (files.length === 0) return;
    setError(null);
    const room = BOARD.maxPhotos - photos.length;
    if (files.length > room) {
      setError(
        room <= 0
          ? `Er passen maximaal ${BOARD.maxPhotos} foto's bij een bericht.`
          : `Er passen nog ${room === 1 ? "één foto" : `${room} foto's`} bij. De rest laat ik weg.`,
      );
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = `nieuw-${++counter.current}`;
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      setPhotos((current) => [...current, { key, id: null, url: preview, local: true }]);
      setUploading((n) => n + 1);
      const result = await uploadBoardPhoto(file, author.id);
      setUploading((n) => n - 1);
      if ("fout" in result) {
        setError(result.fout);
        setPhotos((current) => current.filter((p) => p.key !== key));
      } else {
        setPhotos((current) => current.map((p) => (p.key === key ? { ...p, id: result.id } : p)));
      }
    }
  }

  function remove(key: string) {
    setPhotos((current) => current.filter((p) => p.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading > 0) return;
    const ids = photos.flatMap((p) => (p.id ? [p.id] : []));
    const problem = bodyProblem(cleanBody(text), ids.length);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit({ tekst: text, fotos: ids });
      if ("fout" in result) {
        setError(result.fout);
        return;
      }
      if (mode !== "bewerk") {
        setText("");
        setPhotos([]);
      }
      await onDone();
    } catch {
      setError("Geen verbinding. Probeer het opnieuw als je weer internet hebt.");
    } finally {
      setPending(false);
    }
  }

  const hint =
    mode === "nieuw" && authors.length <= 1
      ? author.id === STAFF_AS
        ? "Je plaatst als De spelleiding."
        : `Je plaatst als ${author.name}. Iedereen in de familie ziet je naam.`
      : mode === "reactie" && authors.length > 1
        ? `Je reageert als ${author.name}.`
        : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-busy={pending}>
      {children}
      {mode === "nieuw" && authors.length > 1 ? (
        <Keuzelijst label="Plaats als" value={author.id} onChange={(event) => onAuthorChange?.(event.target.value)}>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Keuzelijst>
      ) : null}
      <Tekstvak
        label={label ?? tekst.label}
        name="tekst"
        rows={mode === "reactie" ? 2 : 3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={BOARD.maxBody}
        placeholder={tekst.placeholder}
        hint={hint ? bijElkaar(hint) : undefined}
      />
      {text.length > BOARD.maxBody - 200 ? (
        <p className="m-0 -mt-1.5 text-label" aria-live="polite">
          {bijElkaar(`${text.length} van ${BOARD.maxBody} tekens`)}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Foto's bij dit bericht">
          {photos.map((photo, index) => (
            <li key={photo.key} className="relative h-[76px] w-[76px] overflow-hidden rounded-tegel bg-zand">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview or signed link */}
              <img src={photo.url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
              {photo.id === null ? (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgba(43,24,16,0.62)] text-klein font-bold text-beeldbuis">
                  Bezig…
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(photo.key)}
                className="absolute top-0 right-0 flex h-11 w-11 items-start justify-end p-1"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-pil bg-studio text-beeldbuis">
                  <IconSluiten size={14} />
                </span>
                <span className="sr-only">Haal foto {index + 1} weg</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <Melding tone="fout">{bijElkaar(error)}</Melding> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        {photos.length < BOARD.maxPhotos ? (
          <Knop
            variant="secundair-licht"
            size="klein"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
          >
            <IconFoto size={20} />
            Foto erbij
          </Knop>
        ) : null}
        {onCancel ? (
          <Knop variant="secundair-licht" size="klein" onClick={onCancel} disabled={pending}>
            Annuleer
          </Knop>
        ) : null}
        <Knop type="submit" size="klein" className="ml-auto" disabled={pending || uploading > 0}>
          {pending ? tekst.bezig : uploading > 0 ? "Foto gaat omhoog…" : tekst.knop}
        </Knop>
      </div>
    </form>
  );
}
