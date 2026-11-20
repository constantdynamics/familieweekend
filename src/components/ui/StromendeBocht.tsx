"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The zeskampbocht, alive: every ten seconds each lane takes over the colour
 * of the lane next to it (mosterd → oranje → roest → mosterd). The new colour
 * flows in from the left, through the bend and down, in four seconds. In
 * between nothing moves, so the phone has nothing to do, and the first
 * hand-over waits until the page has settled.
 *
 * Before JavaScript runs, and for screen readers, it is the plain bocht.
 * With "reduce motion" nothing flows: every half minute the colours fade
 * very slowly to the next one.
 */
const KLEUREN = ["#F5AE1B", "#F06A1F", "#B4441A"]; // mosterd, oranje, roest

/** Lane i starts with colour i; every hand-over moves each lane one colour on. */
const BANEN = [
  { y: 10, r: 62 },
  { y: 20, r: 52 },
  { y: 30, r: 42 },
];

const EERSTE_KEER = 4000; // ms after the page is shown
const ELKE = 10000; // one hand-over every ten seconds
const STROOM = 4000; // the new colour flows in, in four seconds
const NA_ELKAAR = 450; // each lower lane starts a little later
const RUSTIG = 30000; // with reduce motion: one slow fade every half minute

type Props = {
  /** How far the lanes run down along the right edge. */
  drop?: number;
};

export function StromendeBocht({ drop = 140 }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  // Distance from the left edge of the screen to the right edge of the bocht.
  const [breedte, setBreedte] = useState<number | null>(null);
  // How many hand-overs have happened.
  const [stap, setStap] = useState(0);
  // True while the new colours flow in.
  const [stroomt, setStroomt] = useState(false);
  const [rustig, setRustig] = useState(false);

  useEffect(() => {
    const meet = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setBreedte(Math.ceil(rect.right));
    };
    meet();
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
  }, []);

  useEffect(() => {
    const beperkt = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const plan = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setStroomt(false);
      setRustig(beperkt.matches);
      if (beperkt.matches) {
        const vervaag = () => {
          setStap((s) => s + 1);
          later(vervaag, RUSTIG);
        };
        later(vervaag, RUSTIG);
        return;
      }
      const wissel = () => {
        setStroomt(true);
        // Once the last lane is full, the new colour becomes the base and
        // the flowing layer starts again, hidden, with the next colour.
        later(() => {
          setStap((s) => s + 1);
          setStroomt(false);
        }, STROOM + (BANEN.length - 1) * NA_ELKAAR + 100);
        later(wissel, ELKE);
      };
      later(wissel, EERSTE_KEER);
    };

    plan();
    beperkt.addEventListener("change", plan);
    return () => {
      timers.forEach(clearTimeout);
      beperkt.removeEventListener("change", plan);
    };
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      width="80"
      height={drop + 10}
      viewBox={`0 0 80 ${drop + 10}`}
      className="pointer-events-none absolute top-0 right-0 overflow-visible"
    >
      {BANEN.map(({ y, r }, i) => {
        const right = 70 - i * 10;
        const staart = `H${right - r} A${r} ${r} 0 0 1 ${right} ${y + r} V${drop}`;
        return (
          <g key={y}>
            <path
              d={`M-3000 ${y} ${staart}`}
              className={rustig ? "bocht-vervaag" : undefined}
              stroke={KLEUREN[(i + stap) % 3]}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {breedte !== null && !rustig ? (
              <path
                // Starts at the left edge of the screen, so the colour flows
                // over the visible part in the full four seconds.
                d={`M${80 - breedte - 8} ${y} ${staart}`}
                pathLength={100}
                stroke={KLEUREN[(i + stap + 1) % 3]}
                // The gap is longer than the lane, so the hidden layer never leaves a dot.
                strokeDasharray="100 120"
                style={{
                  strokeDashoffset: stroomt ? 0 : 101,
                  transition: stroomt
                    ? `stroke-dashoffset ${STROOM}ms cubic-bezier(0.45, 0, 0.55, 1) ${i * NA_ELKAAR}ms`
                    : "none",
                }}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
