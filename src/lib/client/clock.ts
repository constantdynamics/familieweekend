"use client";

import { useSyncExternalStore } from "react";

/**
 * The phone's own clock, for screens that change with time ("Nu", "nog 18
 * minuten", which day tab opens). It ticks on whole steps and once more when
 * the page comes back into view. The server render uses `serverNow`, so the
 * first paint matches the HTML and the phone takes over right after.
 */
const subscribers = new Map<number, (onChange: () => void) => () => void>();

function subscribeEvery(stepMs: number) {
  let subscribe = subscribers.get(stepMs);
  if (!subscribe) {
    subscribe = (onChange: () => void) => {
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        timer = setTimeout(
          () => {
            onChange();
            schedule();
          },
          stepMs - (Date.now() % stepMs) + 20,
        );
      };
      schedule();
      document.addEventListener("visibilitychange", onChange);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onChange);
      };
    };
    subscribers.set(stepMs, subscribe);
  }
  return subscribe;
}

/** Now in epoch ms, rounded down to whole steps (10 seconds by default). */
export function useNow(serverNow: number, stepMs = 10_000): number {
  return useSyncExternalStore(
    subscribeEvery(stepMs),
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => Math.floor(serverNow / stepMs) * stepMs,
  );
}
