/**
 * The studio set: the "zeskampbocht" (three lanes that bend down at the top
 * right) and the subtle sun rays behind the start screen and the ceremony.
 */

type BochtProps = {
  /** How far the lanes run down along the right edge, in px from the top. */
  drop?: number;
};

/**
 * Three 7 px lanes in mustard, orange and rust. They run in from the left and
 * bend down with radii 62, 52 and 42 px, 10 px from the right edge. The svg
 * is anchored to the right and draws its horizontal part outside its own box,
 * so the curve keeps its true shape at every screen width.
 */
export function Bocht({ drop = 140 }: BochtProps) {
  const lanes = [
    { y: 10, r: 62, color: "#F5AE1B" },
    { y: 20, r: 52, color: "#F06A1F" },
    { y: 30, r: 42, color: "#B4441A" },
  ];
  return (
    <svg
      aria-hidden="true"
      width="80"
      height={drop + 10}
      viewBox={`0 0 80 ${drop + 10}`}
      className="pointer-events-none absolute top-0 right-0 overflow-visible"
    >
      {lanes.map(({ y, r, color }, i) => {
        const right = 70 - i * 10;
        const startArc = right - r;
        return (
          <path
            key={color}
            d={`M-3000 ${y} H${startArc} A${r} ${r} 0 0 1 ${right} ${y + r} V${drop}`}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

type StralenProps = {
  /** Vertical offset of the ray circle; the prototype uses -420 (home) and -300 (ceremony). */
  top?: number;
  tint?: "zacht" | "feest";
};

export function Stralen({ top = -420, tint = "zacht" }: StralenProps) {
  return (
    <div
      aria-hidden="true"
      className="zonnestralen pointer-events-none absolute left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full"
      style={{
        top,
        ...(tint === "feest"
          ? {
              background:
                "repeating-conic-gradient(from 0deg, #3D2413 0deg 7deg, #2B1810 7deg 14deg)",
            }
          : null),
      }}
    />
  );
}
