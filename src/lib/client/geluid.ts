"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Sound for the prize ceremony (SPEC §4.5 and §6.5): a drumroll and a
 * fanfare, synthesized with WebAudio, no recorded music. On by default only
 * on the admin's phone (on a speaker); everyone else can switch it on, and
 * everyone can switch it off.
 */

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audio = new Ctor();
  } catch {
    return null;
  }
  master = audio.createGain();
  master.gain.value = 0.7;
  master.connect(audio.destination);
  return audio;
}

/** Call from a tap: browsers only allow sound once someone touched the page. */
export async function wekGeluid(): Promise<boolean> {
  const ctx = context();
  if (!ctx) return false;
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  return ctx.state === "running";
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

/** One stroke on the snare: a burst of filtered noise with a short body. */
function slag(ctx: AudioContext, out: AudioNode, at: number, level: number) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1900;
  band.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  source.connect(band).connect(gain).connect(out);
  source.start(at, Math.random() * 0.8, 0.12);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(200, at);
  body.frequency.exponentialRampToValueAtTime(120, at + 0.06);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(level * 0.3, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  body.connect(bodyGain).connect(out);
  body.start(at);
  body.stop(at + 0.08);
}

/** A cymbal crash. */
function bekken(ctx: AudioContext, out: AudioNode, at: number) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 5500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.45, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
  source.connect(high).connect(gain).connect(out);
  source.start(at);
  source.stop(at + 1.9);
}

/**
 * Tromgeroffel: a snare roll that slowly swells and keeps going until the
 * returned function stops it.
 */
export function tromgeroffel(): () => void {
  const ctx = context();
  const out = master;
  if (!ctx || !out) return () => undefined;
  const begin = ctx.currentTime + 0.05;
  let next = begin;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.3;
    while (next < horizon) {
      const swell = Math.min(1, 0.2 + (next - begin) / 4);
      slag(ctx, out, next + (Math.random() - 0.5) * 0.006, 0.1 + 0.45 * swell * (0.85 + Math.random() * 0.15));
      next += 0.046;
    }
  };
  schedule();
  const timer = setInterval(schedule, 100);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** One brass note: two detuned saws through a filter that opens. */
function blazer(ctx: AudioContext, out: AudioNode, frequency: number, at: number, length: number, level = 0.16) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(600, at);
  filter.frequency.exponentialRampToValueAtTime(3200, at + 0.06);
  filter.frequency.exponentialRampToValueAtTime(1800, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.03);
  gain.gain.setValueAtTime(level * 0.85, at + Math.max(0.04, length - 0.06));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.12);
  filter.connect(gain).connect(out);
  for (const detune of [-7, 6]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + length + 0.15);
  }
}

/** The fanfare for the winner, with a cymbal crash. */
export function fanfare(): void {
  const ctx = context();
  const out = master;
  if (!ctx || !out) return;
  const t = ctx.currentTime + 0.05;
  bekken(ctx, out, t);
  const G4 = 392;
  const C5 = 523.25;
  const D5 = 587.33;
  const E5 = 659.25;
  const G5 = 783.99;
  const C6 = 1046.5;
  const melody: [number, number, number][] = [
    [G4, 0, 0.13],
    [G4, 0.15, 0.13],
    [G4, 0.3, 0.13],
    [C5, 0.45, 0.55],
    [E5, 1.05, 0.13],
    [D5, 1.2, 0.13],
    [E5, 1.35, 0.13],
    [G5, 1.5, 0.45],
    [C6, 2.0, 1.1],
  ];
  for (const [frequency, start, length] of melody) blazer(ctx, out, frequency, t + start, length);
  // The final chord underneath.
  for (const frequency of [C5, E5, G5]) blazer(ctx, out, frequency, t + 2.0, 1.1, 0.07);
}

/* ------------------------------------------------------------------------ */
/* On or off, per phone                                                      */
/* ------------------------------------------------------------------------ */

const KEY = "valk-geluid";
const geluidListeners = new Set<() => void>();
/** The choice in memory too, for when the browser keeps no storage. */
let gekozen: "aan" | "uit" | null = null;

function stored(): "aan" | "uit" | null {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "aan" || value === "uit") return value;
  } catch {
    // No storage in this browser.
  }
  return gekozen;
}

function subscribeGeluid(listener: () => void) {
  geluidListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    geluidListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Sound on or off on this phone; the default is on only for the admin. */
export function useGeluid(standaardAan: boolean): [boolean, (aan: boolean) => void] {
  const value = useSyncExternalStore(subscribeGeluid, stored, () => null);
  const aan = value === null ? standaardAan : value === "aan";
  const zet = useCallback((next: boolean) => {
    gekozen = next ? "aan" : "uit";
    try {
      localStorage.setItem(KEY, next ? "aan" : "uit");
    } catch {
      // Private mode: it holds until the page closes.
    }
    for (const listener of geluidListeners) listener();
    if (next) void wekGeluid();
  }, []);
  return [aan, zet];
}
