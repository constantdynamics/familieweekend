/// <reference lib="webworker" />
/**
 * Service worker (Serwist). Caches the app shell so the app opens without a
 * connection, and shows /offline for pages it has never seen.
 *
 * Never cached: API calls, the admin screens and (later) quiz questions.
 * A new version waits until the user taps "Nieuwe versie beschikbaar".
 */
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistPlugin,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

/** Don't store redirects (e.g. to the code screen) under the page's URL. */
const noRedirects: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (response.redirected || response.status !== 200 ? null : response),
};

/**
 * Only requests to the app itself go through the service worker. Others,
 * such as the map tiles of OpenStreetMap, go straight to the network: a
 * fetch by the worker falls under its own connect-src, which does not list
 * those hosts, so the map stayed empty.
 */
const eigen = (url: URL) => url.origin === self.location.origin;

const neverCache = ({ url, request }: { url: URL; request: Request }) =>
  eigen(url) &&
  (url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/beheer") ||
    // SPEC §4: quiz questions are never cached, and the quiz page holds the open question.
    url.pathname === "/quiz" ||
    url.pathname.startsWith("/quiz/") ||
    request.method !== "GET");

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: neverCache, handler: new NetworkOnly() },
    {
      // Pages: always try the network first, fall back to the last copy.
      matcher: ({ url, request }) => eigen(url) && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "paginas",
        networkTimeoutSeconds: 4,
        plugins: [noRedirects, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      // Hashed build files never change.
      matcher: ({ url }) => eigen(url) && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "app-bestanden",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      matcher: ({ url, request }) => eigen(url) && (request.destination === "image" || request.destination === "font"),
      handler: new StaleWhileRevalidate({
        cacheName: "beelden",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
