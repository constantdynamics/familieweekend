import type { SVGProps } from "react";

/**
 * Line icons for the fun facts, in the style of icons.tsx: 2–2.4 px strokes
 * with round caps, always decorative (the text next to them carries the
 * meaning). Never emoji.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };

function Line({ size = 22, strokeWidth = 2.2, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** A light bulb: a fun fact. */
export const IconFeitje = (p: IconProps) => (
  <Line {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
  </Line>
);

/** Three bars on a base line: statistics. */
export const IconStaafjes = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V6M17 16v-8" strokeWidth={3} />
  </Line>
);

/** A wand with a spark: the AI version of a photo. */
export const IconToverstaf = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 20l11-11M13 7l2 2" />
    <path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M10 3v2M9 4h2" />
  </Line>
);

/** An hourglass: not open yet. */
export const IconZandloper = (p: IconProps) => (
  <Line {...p}>
    <path d="M7 3h10M7 21h10" />
    <path d="M8 3c0 4 4 5 4 9s-4 5-4 9M16 3c0 4-4 5-4 9s4 5 4 9" />
  </Line>
);
