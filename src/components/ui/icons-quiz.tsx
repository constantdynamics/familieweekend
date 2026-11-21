import type { ReactNode, SVGProps } from "react";

/**
 * Line icons for the quiz, in the pattern of icons.tsx: 2–2.4 px strokes
 * with round caps (SPEC §6.4), decorative (aria-hidden), never emoji.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };

function Line({ size = 22, strokeWidth = 2.2, children, ...rest }: IconProps & { children: ReactNode }) {
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

/** A person: "Alleen jullie captain kan antwoorden." */
export const IconPersoon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Line>
);

/** A magic wand: the AI tile of Echt of AI. */
export const IconToverstaf = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 20L15 9" />
    <path d="M13 7l4 4" />
    <path d="M18 3v3M16.5 4.5h3M7 4v2M6 5h2M20 13v2M19 14h2" />
  </Line>
);

export const IconLuidspreker = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Line>
);

export const IconLuidsprekerUit = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Line>
);

/** Scales: the fairness check. */
export const IconWeegschaal = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 4v16M5 20h14M4 9l3-5 3 5a3 3 0 0 1-6 0zM14 9l3-5 3 5a3 3 0 0 1-6 0zM7 4h10" />
  </Line>
);

/** Backspace on the number keypad. */
export const IconWisTerug = (p: IconProps) => (
  <Line {...p}>
    <path d="M9 5h11v14H9l-6-7z" />
    <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
  </Line>
);

/** A round flag: start or end of the quiz. */
export const IconVlag = (p: IconProps) => (
  <Line {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Line>
);
