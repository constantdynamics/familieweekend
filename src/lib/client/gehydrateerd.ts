"use client";

import { useSyncExternalStore } from "react";

const nietsTeVolgen = () => () => {};

/**
 * False on the server and during hydration, true right after. Forms set
 * `data-klaar` with it, so the e2e tests only type once React listens;
 * text typed before that could be lost on a slow phone too.
 */
export function useGehydrateerd(): boolean {
  return useSyncExternalStore(
    nietsTeVolgen,
    () => true,
    () => false,
  );
}
