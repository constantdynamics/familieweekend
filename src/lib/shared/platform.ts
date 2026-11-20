export type Platform = "ios" | "android" | "anders";

/** Rough platform guess for the install instructions only. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ pretends to be a Mac, but has a touch screen.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "anders";
}

/** Chrome's install prompt, captured early by the inline script in the root layout. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __valkInstall?: InstallPromptEvent | null;
  }
}

/** Runs before React; keeps the `beforeinstallprompt` event for later. */
export const INSTALL_CAPTURE_SCRIPT = `(function(){try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__valkInstall=e;window.dispatchEvent(new Event('valk:installeerbaar'));});window.addEventListener('appinstalled',function(){window.__valkInstall=null;window.dispatchEvent(new Event('valk:installeerbaar'));});}catch(_){}})();`;
