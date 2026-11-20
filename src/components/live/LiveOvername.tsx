"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLive } from "@/lib/client/live";

type Live = { mode: "rust" | "quiz" | "intermezzo" | "ceremonie" };

/** Where each live moment takes over the whole screen (SPEC §4). */
const DOEL: Partial<Record<Live["mode"], string>> = {
  quiz: "/quiz",
  intermezzo: "/quiz",
  ceremonie: "/ceremonie",
};

/**
 * When the quiz, the intermezzo or the prize ceremony starts, every phone in
 * the app goes there at once. Only on the switch itself: someone who taps
 * away afterwards is not pulled back.
 */
export function LiveOvername() {
  const { data } = useLive<Live>("/api/live");
  const router = useRouter();
  const pathname = usePathname();
  const vorige = useRef<Live["mode"] | null>(null);

  useEffect(() => {
    if (!data) return;
    const mode = data.mode;
    const eerder = vorige.current;
    vorige.current = mode;
    if (eerder === null || eerder === mode) return;
    const doel = DOEL[mode];
    if (doel && pathname !== doel) router.push(doel);
  }, [data, pathname, router]);

  return null;
}
