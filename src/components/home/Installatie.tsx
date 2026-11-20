"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { detectPlatform, type Platform } from "@/lib/shared/platform";
import { Knop } from "@/components/ui/Knop";
import { IconDeel, IconMenuPunten, IconPlusVak, IconSluiten, IconVinkje } from "@/components/ui/icons";

function subscribeInstall(onChange: () => void) {
  window.addEventListener("valk:installeerbaar", onChange);
  return () => window.removeEventListener("valk:installeerbaar", onChange);
}

function useInstallPrompt() {
  return useSyncExternalStore(
    subscribeInstall,
    () => window.__valkInstall ?? null,
    () => null,
  );
}

const noopSubscribe = () => () => {};

function usePlatform(): Platform | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}

/**
 * One line under the home screen: how to put the app on your home screen.
 * Hidden by CSS once the app runs from the home screen (display-mode).
 */
export function InstallatieHint() {
  const platform = usePlatform();
  const prompt = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.__valkInstall = null;
    if (choice.outcome === "accepted") setDone(true);
  }

  let text = "Zet de app op je beginscherm, dan heb je hem altijd bij de hand.";
  if (platform === "ios") text = "Zet de app op je beginscherm: tik op Deel en kies Zet op beginscherm.";
  if (platform === "android") text = "Zet de app op je beginscherm via het menu van je browser.";
  if (done) text = "Gelukt! De Spelen staan op je beginscherm.";

  return (
    <div className="alleen-in-browser mt-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 text-label text-zand">
        <span className="flex-none text-mosterd">
          {done ? <IconVinkje size={26} /> : <IconDeel size={26} />}
        </span>
        <span>{text}</span>
      </div>
      {!done ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-9">
          {prompt ? (
            <Knop size="klein" onClick={install}>
              Installeer de app
            </Knop>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="min-h-11 bg-transparent p-0 text-label font-bold text-mosterd underline underline-offset-4 hover:text-beeldbuis"
          >
            Zo werkt het
          </button>
        </div>
      ) : null}
      <InstallatieUitleg open={open} onClose={() => setOpen(false)} platform={platform ?? "anders"} />
    </div>
  );
}

type UitlegProps = { open: boolean; onClose: () => void; platform: Platform };

const STAPPEN: Record<"ios" | "android", { icon: React.ReactNode; tekst: React.ReactNode }[]> = {
  ios: [
    { icon: <IconDeel size={24} />, tekst: <>Tik op <strong>Deel</strong>, het vierkantje met het pijltje omhoog. In Safari zit het onderin of bovenin.</> },
    { icon: <IconPlusVak size={24} />, tekst: <>Scroll een stukje en kies <strong>Zet op beginscherm</strong>.</> },
    { icon: <IconVinkje size={24} />, tekst: <>Tik rechtsboven op <strong>Voeg toe</strong>.</> },
  ],
  android: [
    { icon: <IconMenuPunten size={24} />, tekst: <>Tik rechtsboven op het <strong>menu</strong>, de drie puntjes.</> },
    { icon: <IconPlusVak size={24} />, tekst: <>Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</> },
    { icon: <IconVinkje size={24} />, tekst: <>Bevestig met <strong>Installeren</strong>.</> },
  ],
};

export function InstallatieUitleg({ open, onClose, platform }: UitlegProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"ios" | "android">(platform === "android" ? "android" : "ios");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTab(platform === "android" ? "android" : "ios");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, platform]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="installatie-titel"
      className="op-licht m-0 mt-auto w-full max-w-none bg-transparent p-0 text-studio backdrop:bg-schaduw/75 open:flex open:justify-center"
      style={{ maxHeight: "100dvh" }}
    >
      <div
        className="w-full max-w-[560px] rounded-t-kaart-groot bg-beeldbuis px-[22px] pt-5 motion-safe:animate-kaart-in"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="installatie-titel" className="m-0 text-[22px] leading-tight font-extrabold">
            Zet de app op je beginscherm
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-studio text-beeldbuis"
          >
            <IconSluiten size={20} />
          </button>
        </div>

        <div role="tablist" aria-label="Kies je telefoon" className="mt-4 grid grid-cols-2 gap-1.5 rounded-[18px] bg-zand p-1.5">
          {(["ios", "android"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`stappen-${key}`}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-tegel text-[16px] font-extrabold ${
                tab === key ? "bg-studio text-beeldbuis" : "bg-transparent text-studio"
              }`}
            >
              {key === "ios" ? "iPhone" : "Android"}
            </button>
          ))}
        </div>

        <div id={`stappen-${tab}`} role="tabpanel" aria-label={tab === "ios" ? "iPhone" : "Android"} className="mt-4">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {STAPPEN[tab].map((stap, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-pil bg-mosterd text-studio">
                  {stap.icon}
                </span>
                <span className="pt-2.5 text-[16px] leading-[1.4]">
                  <span className="sr-only">Stap {index + 1}: </span>
                  {stap.tekst}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-4 mb-0 text-label leading-[1.4]">
          {tab === "ios"
            ? "Open de Spelen daarna vanaf je beginscherm en vul de familiecode nog één keer in."
            : "De Spelen staan daarna tussen je apps, met het embleem als icoon."}
        </p>

        <Knop variant="secundair-licht" className="mt-5 w-full" onClick={onClose}>
          Sluiten
        </Knop>
      </div>
    </dialog>
  );
}
