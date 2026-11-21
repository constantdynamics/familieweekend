import type { SVGProps } from "react";

/**
 * Extra line icons for the scoreboard, the zeskamp and the ceremony, in the
 * pattern of icons.tsx: 2–2.4 px strokes with round caps, decorative only.
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

export const IconOmlaag = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Line>
);

export const IconTrom = (p: IconProps) => (
  <Line {...p}>
    <ellipse cx="12" cy="10" rx="8" ry="3" />
    <path d="M4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M7 3l4 5M17 3l-4 5" />
  </Line>
);

export const IconGeluid = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Line>
);

export const IconGeluidUit = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Line>
);

export const IconPodium = (p: IconProps) => (
  <Line {...p}>
    <path d="M3 20h18M4 20v-6h5v6M9 20V9h6v11M15 20v-4h5v4M12 3.5v2.5" />
  </Line>
);

export const IconStart = (p: IconProps) => (
  <Line {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Line>
);

export const IconStop = (p: IconProps) => (
  <Line {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Line>
);

export const IconWolkUit = (p: IconProps) => (
  <Line {...p}>
    <path d="M7.5 18.5H17a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7.5 18.5z" />
    <path d="M4 4l16 16" />
  </Line>
);
