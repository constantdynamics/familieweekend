import type { ReactNode, SVGProps } from "react";

/**
 * Extra line icons for the prikbord, in the style of icons.tsx: 2–2.4 px
 * strokes with round caps (SPEC §6.4). Decorative; the text carries the meaning.
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

/** A megaphone: messages from the spelleiding. */
export const IconMegafoon = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1z" />
    <path d="M8 15.5l1.2 4h2.3l-1-3.4M18.5 9.5a3.5 3.5 0 0 1 0 5" />
  </Line>
);

/** A small flame: the most popular posts first. */
export const IconVlam = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.3 3.6-8.4.4 1.9 1.4 3 2.6 3.6.1-2.8 1.4-5 3.3-6.6-.2 2.8 3.5 5.6 3.5 10.1 0 4.1-2.9 7.4-6.5 7.4z" />
    <path d="M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.6 2.2-4.2 1.4 1 3.4 2.4 3.4 4.4 0 1.5-1.2 2.6-2.8 2.6z" />
  </Line>
);

/** A clock: the newest posts first. */
export const IconKlok = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Line>
);

/** A chevron: something folds open below. */
export const IconKlapOpen = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 9l6 6 6-6" />
  </Line>
);
