"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useNow } from "@/lib/client/clock";
import { useLive } from "@/lib/client/live";
import { weekendPhase } from "@/lib/shared/countdown";
import type { ThuisData } from "@/lib/shared/home";
import { useGeheugen } from "./geheugen";
import type { WeekendInfo } from "./ThuisTijdens";

/*
 * The weekend screens load only when they are needed: before the weekend
 * Thuis stays as light as it was.
 */
const ThuisTijdens = dynamic(() => import("./ThuisTijdens").then((module) => module.ThuisTijdens));
const ThuisNa = dynamic(() => import("./ThuisNa").then((module) => module.ThuisNa));

type Props = {
  weekend: WeekendInfo;
  /** When the cached page was rendered: the first paint uses this moment. */
  renderedAt: number;
  /** Thuis before the weekend (rendered on the server, in the cached page). */
  voor: ReactNode;
};

/**
 * Which Thuis to show, decided by the phone's own clock: before the kick-off
 * the countdown, from the kick-off (settings.startAt) until the end
 * (settings.endAt) the weekend screen, and after that "Tot de volgende
 * Spelen". The page itself stays cached and the same for everyone; the
 * weekend data comes from /api/thuis and follows the doorbell.
 *
 * Until the new app is live for the family (fase2Live), only the admin gets
 * the new screens; everybody else keeps Thuis exactly as it was.
 */
export function ThuisWissel({ weekend, renderedAt, voor }: Props) {
  const now = useNow(renderedAt);
  const fase = weekendPhase(now, Date.parse(weekend.startAt), Date.parse(weekend.endAt));
  const needsData = fase === "tijdens" || (fase === "na" && !weekend.fase2Live);
  const live = useLive<ThuisData>(needsData ? "/api/thuis" : null);
  const thuis = useGeheugen<ThuisData>("valk:thuis", live.data, live.updatedAt);

  if (fase === "voor") return voor;
  if (!weekend.fase2Live && thuis.data?.toon !== true) return voor;
  if (fase === "na") return <ThuisNa weekend={weekend} />;
  return <ThuisTijdens weekend={weekend} now={now} data={thuis.data} dataAt={thuis.uitGeheugen ? null : thuis.at} />;
}
