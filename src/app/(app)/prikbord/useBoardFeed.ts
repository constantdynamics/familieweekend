"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { meldBijgewerkt } from "@/components/pwa/AppSignalen";
import { useLive } from "@/lib/client/live";

type Versioned = { v: number };

const same = <T,>(next: T) => next;

/**
 * Keep board data fresh without fetching it for nothing. The doorbell rings
 * for every change in the app (also every quiz step), so at a ring the phone
 * first asks the board's own version, one tiny row, and only fetches `url`
 * again when the board really changed. A new `url` (another sort, more
 * posts) is fetched right away. The last good data stays when a fetch fails.
 */
export function useBoardFeed<T extends Versioned>(url: string, initial: T, merge: (next: T, previous: T) => T = same) {
  const [data, setData] = useState<T>(initial);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);
  const shownUrl = useRef(url);
  const handledStamp = useRef<number | null>(null);
  const { data: stamp } = useLive<Versioned>("/api/prikbord/versie");

  /** Fetch now. Resolves when the new data is there (or the fetch failed). */
  const load = useCallback(async (): Promise<void> => {
    const mine = ++ticket.current;
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as T;
      if (mine !== ticket.current) return;
      shownUrl.current = url;
      setData((previous) => merge(next, previous));
      setFailed(false);
      meldBijgewerkt(Date.now());
    } catch {
      if (mine !== ticket.current) return;
      // Try again at the next ring or when the app comes back into view.
      handledStamp.current = null;
      setFailed(true);
    }
  }, [url, merge]);

  // Fetching is the point here; state is only set after the fetch resolves.
  useEffect(() => {
    if (url !== shownUrl.current) {
      void load();
      return;
    }
    if (!stamp || stamp.v === handledStamp.current) return;
    handledStamp.current = stamp.v;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stamp.v !== data.v) void load();
  }, [url, stamp, data.v, load]);

  return { data, failed, load };
}

/** The current time for "5 minuten geleden", ticking every half minute. Starts at the server's time (same HTML). */
export function useNow(start: number, everyMs = 30_000): number {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 500);
    const timer = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}
