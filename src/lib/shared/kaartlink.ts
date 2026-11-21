/**
 * The place in a Google Maps or Street View link, so a map question gets
 * its right answer by pasting the link the admin took the screenshots
 * from. Pure, for the editor in the browser and for the server, which
 * first unfolds a short link from the Maps app (maps.app.goo.gl).
 */

export type Plek = { lat: number; lng: number };

const GETAL = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function geldig(lat: number, lng: number): Plek | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function paar(text: string, pattern: RegExp): Plek | null {
  const match = pattern.exec(text);
  return match ? geldig(Number(match[1]), Number(match[2])) : null;
}

/**
 * The place in a link or in pasted coordinates. In order of preference:
 * - Street View and map links: the camera position after "@" (".../@52.36913,4.90522,3a,75y,...");
 * - links of the Maps URL API: viewpoint=…, cbll=…, ll=…, q=… or query=… with "lat,lng";
 * - a place pin in the data part: "!3d52.36913!4d4.90522";
 * - plain coordinates as Maps copies them: "52.36913, 4.90522".
 * Null when there is no place in it, as in a short link that still has to be unfolded.
 */
export function plekUitLink(invoer: string): Plek | null {
  const text = invoer.trim();
  if (!text) return null;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Keep the text as it is.
  }
  return (
    paar(decoded, new RegExp(String.raw`@${GETAL},${GETAL}`)) ??
    paar(decoded, new RegExp(String.raw`[?&](?:viewpoint|cbll|ll|q|query|destination|center)=${GETAL},\s*${GETAL}`)) ??
    paar(decoded, new RegExp(String.raw`!3d${GETAL}!4d${GETAL}`)) ??
    paar(decoded, new RegExp(String.raw`^${GETAL}\s*,\s*${GETAL}$`))
  );
}

/** A short link from the Maps app, which only the server can unfold. */
export function isKorteKaartLink(invoer: string): boolean {
  try {
    const url = new URL(invoer.trim());
    return (
      url.protocol === "https:" &&
      (url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}

/** Hosts a short link may lead through on its way to the place (Google only). */
export function isGoogleKaartHost(hostname: string): boolean {
  return (
    hostname === "maps.app.goo.gl" ||
    hostname === "goo.gl" ||
    hostname === "consent.google.com" ||
    /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(hostname)
  );
}
