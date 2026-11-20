"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The doorbell on the phone (SPEC §7.2): one connection per device. It
 * listens to the public Realtime channel of its environment and, when that
 * is not available (locally, or the connection drops), asks the server for
 * the version every few seconds. Screens that must stay live fetch their own
 * state whenever the version changes, on focus and when the network returns.
 */

type Realtime = { url: string; key: string } | null;
type Versie = { env: "live" | "test"; v: number; live: boolean; realtime: Realtime };
type Listener = (version: number) => void;

/* Without Realtime: fast while something runs live, calm otherwise. */
const FAST_MS = Number(process.env.NEXT_PUBLIC_VALK_POLL_MS) || 2500;
const CALM_MS = 15_000;
/* With Realtime the ring does the work; asking is only a safety net. */
const SLOW_MS = 30_000;

class Doorbell {
  private listeners = new Set<Listener>();
  private version = 0;
  private env: "live" | "test" | null = null;
  private realtimeKey = "";
  private connected = false;
  private liveNow = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disconnect: (() => void) | null = null;
  private polling = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Ask now (focus, network back, after an own action). */
  poke = () => {
    void this.poll();
  };

  private start() {
    window.addEventListener("focus", this.poke);
    window.addEventListener("online", this.poke);
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.poll();
  }

  private stop() {
    window.removeEventListener("focus", this.poke);
    window.removeEventListener("online", this.poke);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.disconnect?.();
    this.disconnect = null;
    this.realtimeKey = "";
    this.connected = false;
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible") this.poke();
  };

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.listeners.size === 0) return;
    this.timer = setTimeout(() => void this.poll(), this.connected ? SLOW_MS : this.liveNow ? FAST_MS : CALM_MS);
  }

  private async poll() {
    if (this.polling || this.listeners.size === 0) return;
    if (document.visibilityState === "hidden") return this.schedule();
    this.polling = true;
    try {
      const response = await fetch("/api/versie", { cache: "no-store", credentials: "same-origin" });
      if (response.ok) {
        const data = (await response.json()) as Versie;
        if (this.env !== data.env) {
          // Switched between the real and the test environment: start over.
          this.env = data.env;
          this.disconnect?.();
          this.disconnect = null;
          this.realtimeKey = "";
          this.connected = false;
        }
        this.liveNow = data.live;
        this.connect(data.realtime);
        this.update(data.v);
      }
    } catch {
      // Offline: try again later; the screen shows its last state.
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private update(version: number) {
    if (version !== this.version) {
      this.version = version;
      for (const listener of this.listeners) listener(version);
    }
  }

  private connect(realtime: Realtime) {
    if (!realtime || !this.env) return;
    const key = `${realtime.url}|${this.env}`;
    if (key === this.realtimeKey) return;
    this.realtimeKey = key;
    const env = this.env;
    void import("@supabase/realtime-js").then(({ RealtimeClient }) => {
      if (this.realtimeKey !== key) return;
      const client = new RealtimeClient(`${realtime.url.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: realtime.key },
      });
      const channel = client.channel(`valk-${env}`, { config: { broadcast: { self: false } } });
      channel
        .on("broadcast", { event: "seintje" }, (message) => {
          const v = Number((message.payload as { v?: unknown } | undefined)?.v);
          if (Number.isFinite(v)) this.update(v);
        })
        .subscribe((status) => {
          const wasConnected = this.connected;
          this.connected = status === "SUBSCRIBED";
          // Just (re)connected: we may have missed a ring, so ask once.
          if (this.connected && !wasConnected) this.poke();
          else this.schedule();
        });
      this.disconnect = () => {
        void channel.unsubscribe();
        client.disconnect();
      };
    });
  }
}

let doorbell: Doorbell | null = null;

function getDoorbell(): Doorbell {
  doorbell ??= new Doorbell();
  return doorbell;
}

/** Ring the local doorbell after an own action, so this phone updates at once. */
export function pokeLive() {
  doorbell?.poke();
}

export type LiveResult<T> = {
  data: T | null;
  error: boolean;
  /** When the data last arrived (for "laatst bijgewerkt om 11:42"). */
  updatedAt: number | null;
  refresh: () => void;
};

/**
 * Keep `url` (a role-aware API route) fresh: on mount, on every ring, on
 * focus and when the network comes back. The last good data stays visible
 * when a fetch fails.
 */
export function useLive<T>(url: string | null, initial: T | null = null): LiveResult<T> {
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const ticket = ++latest.current;
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const json = (await response.json()) as T;
      if (ticket !== latest.current) return;
      setData(json);
      setError(false);
      setUpdatedAt(Date.now());
    } catch {
      if (ticket === latest.current) setError(true);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    // Fetching on mount is the point here; state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return getDoorbell().subscribe(() => void load());
  }, [url, load]);

  const refresh = useCallback(() => void load(), [load]);
  return { data, error, updatedAt, refresh };
}
