"use client";

import { useEffect, useState } from "react";

/**
 * Offline input for the spelleiders (SPEC §4.9 "Offline invoer"). Starting a
 * game and sending a result first go into a queue in IndexedDB, and leave
 * it as soon as there is a connection: right away, when the network comes
 * back, when the screen becomes visible, and every few seconds while
 * something waits. The server makes it count once (client id), so sending
 * twice is harmless.
 *
 * "Wacht op verbinding…" → "Verstuurd".
 */

export type QueueKind = "start" | "uitslag";

export type QueueStatus = "wacht" | "verstuurd" | "fout";

export type QueueItem = {
  /** The client id: the key here and the idempotency key on the server. */
  id: string;
  kind: QueueKind;
  eventId: string;
  env: "live" | "test";
  body: Record<string, unknown>;
  createdAt: number;
  status: QueueStatus;
  /** Why it failed, or why it still waits (logged out). */
  fout?: string;
  sentAt?: number;
};

const DB_NAME = "valk-uitslagen";
const STORE = "wachtrij";
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

let opening: Promise<IDBDatabase | null> | null = null;
/** When IndexedDB is not there (private mode, old browser): only in memory. */
const memory = new Map<string, QueueItem>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(): Promise<QueueItem[]> {
  const database = await openDb();
  if (!database) return [...memory.values()];
  try {
    const items = await done(database.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<QueueItem[]>);
    return items;
  } catch {
    return [...memory.values()];
  }
}

async function write(item: QueueItem): Promise<void> {
  memory.set(item.id, item);
  const database = await openDb();
  if (!database) return;
  try {
    await done(database.transaction(STORE, "readwrite").objectStore(STORE).put(item));
  } catch {
    // The copy in memory still goes out while this page is open.
  }
}

async function remove(id: string): Promise<void> {
  memory.delete(id);
  const database = await openDb();
  if (!database) return;
  try {
    await done(database.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } catch {
    // Nothing to do.
  }
}

const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A fresh id for one submission. */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Put something in the queue and try to send it at once. */
export async function enqueue(item: Omit<QueueItem, "status" | "createdAt">): Promise<void> {
  await write({ ...item, status: "wacht", createdAt: Date.now() });
  changed();
  void flush();
}

export async function itemsFor(eventId: string): Promise<QueueItem[]> {
  return (await readAll()).filter((item) => item.eventId === eventId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Forget sent items of this game (after the admin reset it, say). */
export async function forgetEvent(eventId: string): Promise<void> {
  for (const item of await itemsFor(eventId)) if (item.status !== "wacht") await remove(item.id);
  changed();
}

type Outcome = { status: "ok" } | { status: "later"; fout?: string } | { status: "fout"; fout: string };

async function send(item: QueueItem): Promise<Outcome> {
  const url = item.kind === "start" ? "/api/zeskamp/start" : "/api/zeskamp/uitslag";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ ...item.body, eventId: item.eventId, env: item.env }),
    });
    if (response.ok) return { status: "ok" };
    const data = (await response.json().catch(() => ({}))) as { fout?: string };
    if (response.status === 401) return { status: "later", fout: "Log opnieuw in als spelleider, dan gaat hij alsnog." };
    if (response.status >= 500 || response.status === 408 || response.status === 429) return { status: "later" };
    return { status: "fout", fout: data.fout ?? "Dit lukte niet. Vraag het de beheerder." };
  } catch {
    return { status: "later" };
  }
}

let flushing: Promise<void> | null = null;

async function flushNow(): Promise<void> {
  const items = (await readAll()).sort((a, b) => a.createdAt - b.createdAt);
  const now = Date.now();
  for (const item of items) {
    if (item.status !== "wacht" && now - item.createdAt > KEEP_MS) await remove(item.id);
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  for (const item of items) {
    if (item.status !== "wacht") continue;
    const outcome = await send(item);
    if (outcome.status === "later") {
      if (outcome.fout !== item.fout) {
        await write({ ...item, fout: outcome.fout });
        changed();
      }
      // Keep the order: what came later waits too.
      break;
    }
    await write(
      outcome.status === "ok"
        ? { ...item, status: "verstuurd", fout: undefined, sentAt: Date.now() }
        : { ...item, status: "fout", fout: outcome.fout },
    );
    changed();
  }
}

/** Send what waits, one flush at a time. */
export function flush(): Promise<void> {
  flushing ??= flushNow().finally(() => {
    flushing = null;
  });
  return flushing;
}

let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const onOnline = () => void flush();
const onVisible = () => {
  if (document.visibilityState === "visible") void flush();
};

/** Keep sending while a screen needs it. Returns the stop function. */
export function keepFlushing(): () => void {
  users += 1;
  if (users === 1) {
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    timer = setInterval(() => void flush(), 4000);
  }
  void flush();
  return () => {
    users -= 1;
    if (users === 0) {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

async function waiting(): Promise<QueueItem[]> {
  return (await readAll()).filter((item) => item.status === "wacht" && item.kind === "uitslag");
}

/**
 * Queue items, kept up to date, while the queue keeps sending: of one game,
 * or (eventId null) every result that still waits. `geladen` turns true once
 * the queue has been read.
 */
export function useWachtrij(eventId: string | null): { items: QueueItem[]; geladen: boolean } {
  const [state, setState] = useState<{ items: QueueItem[]; geladen: boolean }>({ items: [], geladen: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void (eventId ? itemsFor(eventId) : waiting()).then((items) => {
        if (alive) setState({ items, geladen: true });
      });
    load();
    const unsubscribe = subscribe(load);
    const stop = keepFlushing();
    return () => {
      alive = false;
      unsubscribe();
      stop();
    };
  }, [eventId]);
  return state;
}
