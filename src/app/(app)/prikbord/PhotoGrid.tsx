"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { IconPijlTerug, IconPijlVerder, IconSluiten } from "@/components/ui/icons";
import type { FeedPhoto } from "@/lib/shared/board";

/** One photo keeps (about) its own shape; more photos become a tidy grid. */
function shape(photo: FeedPhoto, index: number, count: number): number {
  if (count === 3 && index === 0) return 16 / 9;
  if (count > 1) return 1;
  if (!photo.width || !photo.height) return 4 / 3;
  return Math.min(1.9, Math.max(0.75, photo.width / photo.height));
}

/**
 * The photos of a post. A tap shows the photo large, in a dialog that
 * closes with the button, Escape or a tap next to it. Photos come through
 * short-lived signed links (not next/image, which would cache them).
 */
export function PhotoGrid({ photos, author, className }: { photos: FeedPhoto[]; author: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(0);
  const count = photos.length;
  if (count === 0) return null;
  const current = photos[Math.min(shown, count - 1)];

  function open(index: number) {
    setShown(index);
    dialog.current?.showModal();
  }

  function step(delta: number) {
    setShown((index) => (index + delta + count) % count);
  }

  function onKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (count < 2) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  }

  function onBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current) dialog.current?.close();
  }

  return (
    <>
      <ul className={`m-0 grid list-none gap-1.5 p-0 ${count === 1 ? "grid-cols-1" : "grid-cols-2"} ${className ?? ""}`}>
        {photos.map((photo, index) => (
          <li key={photo.id} className={count === 3 && index === 0 ? "col-span-2" : undefined}>
            <button
              type="button"
              onClick={() => open(index)}
              aria-label={count === 1 ? `Bekijk de foto van ${author} groot` : `Bekijk foto ${index + 1} van ${count} groot`}
              className="block w-full overflow-hidden rounded-tegel bg-zand"
              style={{ aspectRatio: shape(photo, index, count) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived link */}
              <img
                src={photo.url}
                alt=""
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        aria-label={count === 1 ? `Foto van ${author}` : `Foto ${shown + 1} van ${count} van ${author}`}
        onKeyDown={onKey}
        onClick={onBackdrop}
        className="m-auto max-h-[94dvh] w-[min(94vw,640px)] overflow-visible bg-transparent p-0 text-beeldbuis backdrop:bg-[rgba(20,11,6,0.92)]"
      >
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived link */}
          <img
            src={current.url}
            alt={count === 1 ? `Foto van ${author}` : `Foto ${shown + 1} van ${count} van ${author}`}
            className="max-h-[78dvh] w-auto max-w-full rounded-tegel bg-studio-diep object-contain"
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pil border-2 border-zand text-beeldbuis"
                >
                  <IconPijlTerug size={20} />
                  <span className="sr-only">Vorige foto</span>
                </button>
                <span className="cijfers min-w-14 text-center text-[15px] font-bold" aria-hidden="true">
                  {shown + 1} / {count}
                </span>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pil border-2 border-zand text-beeldbuis"
                >
                  <IconPijlVerder size={20} />
                  <span className="sr-only">Volgende foto</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-11 items-center gap-2 rounded-pil bg-oranje px-5 font-extrabold text-studio shadow-knop"
            >
              <IconSluiten size={18} />
              Sluit foto
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
