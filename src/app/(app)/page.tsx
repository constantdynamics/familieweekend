import { cacheLife, cacheTag } from "next/cache";
import { ThuisVoor } from "@/components/home/ThuisVoor";
import { getSettings, SETTINGS_TAG } from "@/lib/server/settings";

/** When this cached page was rendered; the countdown starts from here until it runs on the phone. */
function renderMoment(): number {
  return Date.now();
}

/**
 * Thuis. Everyone sees the same page, so it is cached and part of the static
 * shell; the admin's save refreshes it. The countdown runs on the phone.
 */
export default async function ThuisPage() {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("minutes");

  const settings = await getSettings();
  return <ThuisVoor settings={settings} renderedAt={renderMoment()} />;
}
