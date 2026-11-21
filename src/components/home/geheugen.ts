"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

/*
 * Small helpers for Thuis during the weekend. The phone keeps the last good
 * answer of an API in localStorage, so the app opened without a connection
 * still shows the program and the last known weather, with its time
 * (SPEC §4.10 and §4.12). Browser storage can be missing or throw (private
 * mode); then there is simply no memory.
 */

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export type Bewaard<T> = {
  data: T | null;
  /** When this data arrived from the server (epoch ms). */
  at: number | null;
  /** True when it comes from the phone's memory because the server could not be reached. */
  uitGeheugen: boolean;
};

/** Fresh data when there is some, otherwise what this phone remembers. */
export function useGeheugen<T>(key: string, fresh: T | null, freshAt: number | null): Bewaard<T> {
  const raw = useSyncExternalStore(subscribeStorage, () => readStorage(key), () => null);
  const stored = useMemo(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { at?: unknown; data?: unknown };
      return typeof parsed.at === "number" && parsed.data ? { at: parsed.at, data: parsed.data as T } : null;
    } catch {
      return null;
    }
  }, [raw]);

  useEffect(() => {
    if (fresh === null || freshAt === null) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({ at: freshAt, data: fresh }));
    } catch {
      // No storage (private mode or full): the screen works without memory.
    }
  }, [key, fresh, freshAt]);

  if (fresh !== null) return { data: fresh, at: freshAt, uitGeheugen: false };
  if (stored) return { data: stored.data, at: stored.at, uitGeheugen: true };
  return { data: null, at: null, uitGeheugen: false };
}

export type Opgehaald<T> = { data: T | null; at: number | null; fout: boolean };

/**
 * Fetch `url` now, every `everyMs`, on focus and when the network returns.
 * For data that does not follow the doorbell, like the weather.
 */
export function useOphalen<T>(url: string | null, everyMs: number): Opgehaald<T> {
  const [state, setState] = useState<Opgehaald<T>>({ data: null, at: null, fout: false });

  useEffect(() => {
    if (!url) return;
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as T;
        if (!stopped) setState({ data, at: Date.now(), fout: false });
      } catch {
        if (!stopped) setState((previous) => ({ ...previous, fout: true }));
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = setInterval(() => void load(), everyMs);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, everyMs]);

  return state;
}
