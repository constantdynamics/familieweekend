"use client";

import { useEffect, useRef } from "react";

/** POST to a quiz route; gives `{ fout }` in Dutch when something is wrong. */
export async function stuur(url: string, body: unknown): Promise<{ ok: true } | { ok: false; fout: string; status: number }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { fout?: string };
    if (!response.ok) return { ok: false, fout: data.fout ?? "Dat lukte niet. Probeer het nog een keer.", status: response.status };
    return { ok: true };
  } catch {
    return { ok: false, fout: "Geen verbinding. Probeer het opnieuw zodra je weer internet hebt.", status: 0 };
  }
}

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/**
 * Keep the screen on (Screen Wake Lock) while `aan` is true: for captains
 * and the quizmaster (SPEC §4.6). The lock drops when the page hides, so it
 * is asked again when the page comes back.
 */
export function useWakeLock(aan: boolean) {
  const lock = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    if (!aan) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    let stopped = false;
    const vraag = async () => {
      if (document.visibilityState !== "visible" || (lock.current && !lock.current.released)) return;
      try {
        const sentinel = await nav.wakeLock!.request("screen");
        if (stopped) void sentinel.release();
        else lock.current = sentinel;
      } catch {
        // Not allowed (battery saver, no user gesture yet): the screen just dims as usual.
      }
    };
    void vraag();
    document.addEventListener("visibilitychange", vraag);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", vraag);
      void lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [aan]);
}

/* ------------------------------------------------------------------------ */
/* Sound (SPEC §6.5): a tick in the last ten seconds, a "ding" for right.   */
/* Synthesised with WebAudio, never existing music, and easy to mute.       */
/* ------------------------------------------------------------------------ */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function toon(frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") {
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  const at = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

export const geluid = {
  /** Wake the audio up inside a tap, so later sounds may play. */
  wek() {
    audio();
  },
  tik() {
    toon(1320, 0, 0.05, 0.12, "square");
  },
  ding() {
    toon(988, 0, 0.5, 0.22);
    toon(1480, 0.08, 0.6, 0.16);
  },
};

const GELUID_KEY = "valk-quiz-geluid";
const geluidLuisteraars = new Set<() => void>();
let geluidInGeheugen: boolean | null = null;

/** The sound choice on this phone: true, false, or null when never chosen. */
export function leesGeluid(): boolean | null {
  try {
    const value = localStorage.getItem(GELUID_KEY);
    return value === null ? geluidInGeheugen : value === "aan";
  } catch {
    return geluidInGeheugen;
  }
}

export function abonneerGeluid(onChange: () => void) {
  geluidLuisteraars.add(onChange);
  return () => geluidLuisteraars.delete(onChange);
}

export function bewaarGeluid(aan: boolean) {
  geluidInGeheugen = aan;
  try {
    localStorage.setItem(GELUID_KEY, aan ? "aan" : "uit");
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const listener of geluidLuisteraars) listener();
}
