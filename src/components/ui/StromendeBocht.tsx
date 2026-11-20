"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The zeskampbocht, alive: every ten seconds each lane takes over the colour
 * of the lane next to it. The new colour flows in from the left, through
 * the bend and down (mosterd → oranje → roest → mosterd).
 *
 * Before JavaScript runs, and for screen readers, it is the plain bocht.
 * With "reduce motion" the colours only fade very slowly, nothing moves.
 */
const MOSTERD = "#F5AE1B";
const ORANJE = "#F06A1F";
const ROEST = "#B4441A";

const BANEN = [
  { y: 10, r: 62, kleuren: [MOSTERD, ORANJE, ROEST] },
  { y: 20, r: 52, kleuren: [ORANJE, ROEST, MOSTERD] },
  { y: 30, r: 42, kleuren: [ROEST, MOSTERD, ORANJE] },
];

type Props = {
  /** How far the lanes run down along the right edge. */
  drop?: number;
  /** Subtle highlight on the lanes, like glossy studio decor. */
  glans?: boolean;
};

export function StromendeBocht({ drop = 140, glans = false }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  // Distance from the left edge of the screen to the right edge of the bocht.
  const [breedte, setBreedte] = useState<number | null>(null);

  useEffect(() => {
    const meet = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setBreedte(Math.ceil(rect.right));
    };
    meet();
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
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
      {BANEN.map(({ y, r, kleuren }, i) => {
        const right = 70 - i * 10;
        const staart = `H${right - r} A${r} ${r} 0 0 1 ${right} ${y + r} V${drop}`;
        const start = breedte === null ? -3000 : 80 - breedte - 8;
        return (
          <g key={y}>
            <path
              d={`M-3000 ${y} ${staart}`}
              className="bocht-basis"
              stroke={kleuren[0]}
              style={{ ["--k0" as string]: kleuren[0], ["--k1" as string]: kleuren[1], ["--k2" as string]: kleuren[2] }}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {breedte !== null
              ? [1, 2, 0].map((kleur, stap) => (
                  <path
                    key={stap}
                    d={`M${start} ${y} ${staart}`}
                    pathLength={100}
                    className={`bocht-stroom bocht-stroom-${stap}`}
                    stroke={kleuren[kleur]}
                    style={{ animationDelay: `${i * 0.45}s` }}
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                ))
              : null}
            {glans ? (
              <path
                d={`M-3000 ${y - 1.6} H${right - r} A${r + 1.6} ${r + 1.6} 0 0 1 ${right + 1.6} ${y + r} V${drop}`}
                fill="none"
                stroke="#FFF6E6"
                strokeOpacity="0.28"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
