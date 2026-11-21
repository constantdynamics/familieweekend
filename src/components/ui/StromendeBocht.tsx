"use client";

import { useEffect, useRef, useState } from "react";
import { type AantalBanen, BOCHT_KLEUREN, KLEUREN, KNIK, SVG_BREEDTE, baan, bochtLengte, bochtPad, dikte, startKleur } from "./bocht";

/**
 * The zeskampbocht, alive. One lane at a time takes over the colour of the
 * lane beside it: the new colour flows in slowly from the left edge of the
 * screen, around the corner and down to the bottom. A short rest, then the
 * next lane. Each round starts with the innermost lane, so the colours move
 * outwards, lane by lane, and neighbours never share a colour. A lane on
 * its own (Thuis) walks through the six colours, one flow at a time.
 *
 * Between two flows nothing moves, and the first one waits until the page
 * has settled. Only the lane that flows is redrawn, and its straight part
 * is a 4 px strip, so the phone has little to do.
 *
 * Before JavaScript runs, and for screen readers, it is the still bocht.
 * With "reduce motion" nothing flows: every nine seconds one lane fades
 * very slowly to its next colour.
 */

const SNELHEID = 85; // px per second, a calm pace
const EERSTE_KEER = 5000; // ms after the page is shown
const RUST = 1500; // ms between two lanes
const RONDE_RUST = 6000; // ms after the last lane of a round
const RUSTIG = 9000; // with reduce motion: one lane fades every nine seconds
/** Dash for the straight part: longer than any page, so it is all colour or all gap. */
const HEEL_LANG = 20000;

type Stroom = {
  /** Duration of the flow along the top and around the corner (ms). */
  bocht: number;
  /** Duration of the flow down the straight part (ms). */
  recht: number;
  /** Length of the straight part (px). */
  lengte: number;
};

export function StromendeBocht({ banen = 1 }: { banen?: AantalBanen }) {
  const ref = useRef<SVGSVGElement>(null);
  // Where the left edge of the screen is, in svg coordinates (a little beyond it).
  const [start, setStart] = useState<number | null>(null);
  // How many times each lane has taken over a new colour.
  const [stappen, setStappen] = useState<number[]>(() => Array.from({ length: banen }, () => 0));
  // The lanes that are flowing right now (the next one may start while the
  // previous one still flows far below the screen).
  const [stromen, setStromen] = useState<(Stroom | null)[]>(() => Array.from({ length: banen }, () => null));
  const [rustig, setRustig] = useState(false);

  useEffect(() => {
    const meet = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setStart(SVG_BREEDTE - Math.ceil(rect.right) - 8);
    };
    meet();
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
  }, []);

  useEffect(() => {
    const beperkt = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Innermost lane first.
    const volgorde = Array.from({ length: banen }, (_, i) => banen - 1 - i);
    let timers: number[] = [];
    let beurt = 0;
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const zet = <T,>(lijst: T[], i: number, waarde: T) => lijst.map((oud, j) => (j === i ? waarde : oud));

    const plan = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setStromen(Array.from({ length: banen }, () => null));
      setRustig(beperkt.matches);

      if (beperkt.matches) {
        const vervaag = () => {
          const b = volgorde[beurt++ % banen];
          setStappen((s) => zet(s, b, s[b] + 1));
          later(vervaag, RUSTIG);
        };
        later(vervaag, RUSTIG);
        return;
      }

      const stroom = () => {
        const svg = ref.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const b = volgorde[beurt++ % banen];
        const links = SVG_BREEDTE - Math.ceil(rect.right) - 8;
        const lengte = Math.max(0, rect.height - KNIK);
        const bocht = (bochtLengte(b, links) / SNELHEID) * 1000;
        const recht = (lengte / SNELHEID) * 1000;
        // The next lane may start once this one has reached the bottom of
        // the screen; further down it flows on unseen.
        const inBeeld = Math.min(lengte, Math.max(0, window.innerHeight - rect.top - KNIK));
        setStart(links);
        setStromen((s) => zet(s, b, { bocht, recht, lengte }));
        later(() => {
          // The new colour becomes the lane's own; the flowing layer goes
          // back, hidden, with the colour after that.
          setStappen((s) => zet(s, b, s[b] + 1));
          setStromen((s) => zet(s, b, null));
        }, bocht + recht + 100);
        later(stroom, bocht + (inBeeld / SNELHEID) * 1000 + (beurt % banen === 0 ? RONDE_RUST : RUST));
      };
      later(stroom, EERSTE_KEER);
    };

    plan();
    beperkt.addEventListener("change", plan);
    return () => {
      timers.forEach(clearTimeout);
      beperkt.removeEventListener("change", plan);
    };
  }, [banen]);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      width={SVG_BREEDTE}
      className="pointer-events-none absolute top-0 right-0 h-full overflow-visible"
    >
      {stappen.map((stap, i) => {
        const { x } = baan(i);
        const kleur = BOCHT_KLEUREN[(startKleur(banen, i) + stap) % KLEUREN];
        const nieuw = BOCHT_KLEUREN[(startKleur(banen, i) + stap + 1) % KLEUREN];
        const stroom = stromen[i];
        return (
          <g key={i} fill="none" strokeWidth={dikte(banen)}>
            <path d={bochtPad(i)} stroke={kleur} strokeLinecap="round" className={rustig ? "bocht-vervaag" : undefined} />
            <line x1={x} y1={KNIK} x2={x} y2="100%" stroke={kleur} className={rustig ? "bocht-vervaag" : undefined} />
            {start !== null && !rustig ? (
              <>
                <path
                  // Starts at the left edge of the screen, so the colour
                  // flows over the whole visible part.
                  d={bochtPad(i, start)}
                  pathLength={100}
                  stroke={nieuw}
                  strokeLinecap="round"
                  // The gap is longer than the lane, so the hidden layer never leaves a dot.
                  strokeDasharray="100 120"
                  style={{
                    strokeDashoffset: stroom ? 0 : 101,
                    transition: stroom ? `stroke-dashoffset ${stroom.bocht}ms linear` : "none",
                  }}
                />
                <line
                  x1={x}
                  y1={KNIK}
                  x2={x}
                  y2="100%"
                  stroke={nieuw}
                  strokeDasharray={`${HEEL_LANG} ${HEEL_LANG}`}
                  style={{
                    strokeDashoffset: stroom ? HEEL_LANG - stroom.lengte : HEEL_LANG,
                    transition: stroom ? `stroke-dashoffset ${stroom.recht}ms linear ${stroom.bocht}ms` : "none",
                  }}
                />
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
