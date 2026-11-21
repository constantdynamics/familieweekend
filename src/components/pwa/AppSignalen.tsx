"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useOffline } from "next/offline";
import { Serwist } from "@serwist/window";
import { formatTime } from "@/lib/shared/time";
import { IconVernieuw, IconWifiUit } from "@/components/ui/icons";

/**
 * "Last updated" time for the offline banner. Pages that show data report
 * when that data was fresh; until then the banner shows a general text.
 */
let lastUpdated: number | null = null;
const listeners = new Set<() => void>();

export function meldBijgewerkt(at: number) {
  if (lastUpdated !== null && at <= lastUpdated) return;
  lastUpdated = at;
  for (const listener of listeners) listener();
}

function subscribeUpdated(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lets a server-rendered page say how fresh its data is. */
export function Bijgewerkt({ at }: { at: number }) {
  useEffect(() => meldBijgewerkt(at), [at]);
  return null;
}

declare global {
  interface Window {
    __valkSerwist?: Serwist;
  }
}

/** Offline banner and update toast, mounted once in the root layout. */
export function AppSignalen({ swEnabled }: { swEnabled: boolean }) {
  const offline = useOffline();
  const updatedAt = useSyncExternalStore(subscribeUpdated, () => lastUpdated, () => null);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!swEnabled || !("serviceWorker" in navigator)) return;
    const serwist = window.__valkSerwist ?? new Serwist("/sw.js", { scope: "/", type: "classic", updateViaCache: "none" });
    window.__valkSerwist = serwist;
    const onWaiting = () => setUpdateReady(true);
    // The very first service worker taking over changes nothing on screen,
    // so no reload then: it would wipe what someone is typing. Only a new
    // version replacing an old one reloads, to fetch the new files.
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControlling = (event: { isUpdate?: boolean; isExternal?: boolean }) => {
      if (hadController && (event.isUpdate || event.isExternal)) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    void serwist.register();
    // Check for a new version whenever the app comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") void serwist.update();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [swEnabled]);

  function refresh() {
    setRefreshing(true);
    const serwist = window.__valkSerwist;
    if (serwist) serwist.messageSkipWaiting();
    // Fallback in case the new worker takes over without an event.
    setTimeout(() => window.location.reload(), 2500);
  }

  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center veilig-boven">
        {offline ? (
          <p className="pointer-events-auto m-2 flex max-w-[520px] items-center gap-2.5 rounded-[18px] bg-mosterd px-4 py-2.5 text-[15px] leading-[1.35] font-bold text-studio shadow-tegel">
            <IconWifiUit size={22} className="flex-none" />
            <span>
              {updatedAt
                ? `Je bent offline, laatst bijgewerkt om ${formatTime(new Date(updatedAt))}.`
                : "Je bent offline. Zodra er weer verbinding is, gaat alles vanzelf verder."}
            </span>
          </p>
        ) : null}
      </div>
      {updateReady ? (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex min-h-12 w-full max-w-[520px] items-center gap-3 rounded-[18px] bg-beeldbuis px-4 py-3 text-left text-[15px] leading-[1.35] font-bold text-studio shadow-kaart motion-safe:animate-kaart-in"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-pil bg-oranje">
              <IconVernieuw size={20} />
            </span>
            <span>{refreshing ? "Even verversen…" : "Nieuwe versie beschikbaar, tik om te verversen"}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
