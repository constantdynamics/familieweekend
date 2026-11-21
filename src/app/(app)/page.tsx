import { cacheLife, cacheTag } from "next/cache";
import { ThuisVoor } from "@/components/home/ThuisVoor";
import { ThuisWissel } from "@/components/home/ThuisWissel";
import { getSettings, SETTINGS_TAG } from "@/lib/server/settings";

/** When this cached page was rendered; the countdown starts from here until it runs on the phone. */
function renderMoment(): number {
  return Date.now();
}

/**
 * Thuis. Everyone gets the same cached page (part of the static shell); the
 * admin's save refreshes it. The phone's own clock picks the screen: the
 * countdown before the weekend, Nu & straks during, and "Tot de volgende
 * Spelen" after. Personal parts (your team) are fetched by the phone.
 */
export default async function ThuisPage() {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("minutes");

  const settings = await getSettings();
  const renderedAt = renderMoment();
  return (
    <ThuisWissel
      weekend={{
        startAt: settings.startAt,
        endAt: settings.endAt,
        locationName: settings.locationName,
        locationPlace: settings.locationPlace,
        fase2Live: settings.fase2Live,
      }}
      renderedAt={renderedAt}
      voor={<ThuisVoor settings={settings} renderedAt={renderedAt} />}
    />
  );
}
