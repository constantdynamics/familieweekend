import type { SVGProps } from "react";

/**
 * Inline line icons, 2–2.4 px strokes with round caps (SPEC §6.4). Never emoji.
 * All are decorative (aria-hidden); the text next to them carries the meaning.
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

export const IconThuis = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" />
  </Line>
);

export const IconProgramma = (p: IconProps) => (
  <Line {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4M8 14h3M8 17h6" />
  </Line>
);

export const IconQuiz = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 5h16v11H10l-5 4v-4H4z" />
    <path d="M10 9.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3" />
    <path d="M12 14.3h.01" />
  </Line>
);

export const IconZeskamp = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 10v3.5l2.5 2M10 3h4M12 3v3.5" />
  </Line>
);

export const IconScore = (p: IconProps) => (
  <Line {...p}>
    <path d="M3 20h18M5 20v-6h4v6M10 20V9h4v11M15 20v-4h4v4" />
  </Line>
);

/** iOS-style share: a box with an arrow up. */
export const IconDeel = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 12v8h14v-8" />
  </Line>
);

/** Three vertical dots, the Android browser menu. */
export const IconMenuPunten = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth={3.4} />
  </Line>
);

export const IconPlusVak = (p: IconProps) => (
  <Line {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </Line>
);

export const IconSlot = (p: IconProps) => (
  <Line {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Line>
);

export const IconSluiten = (p: IconProps) => (
  <Line strokeWidth={2.6} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Line>
);

export const IconVinkje = (p: IconProps) => (
  <Line strokeWidth={3} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Line>
);

export const IconPijlTerug = (p: IconProps) => (
  <Line {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Line>
);

export const IconPijlVerder = (p: IconProps) => (
  <Line {...p}>
    <path d="M9 5l7 7-7 7" />
  </Line>
);

export const IconCamera = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Line>
);

export const IconInstellingen = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </Line>
);

export const IconSleutel = (p: IconProps) => (
  <Line {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
  </Line>
);

export const IconPin = (p: IconProps) => (
  <Line {...p}>
    <rect x="3" y="7" width="18" height="11" rx="3" />
    <path d="M7.5 12.5h.01M12 12.5h.01M16.5 12.5h.01" strokeWidth={3.2} />
  </Line>
);

export const IconLogboek = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 3h10l3 3v15H6z" />
    <path d="M9 9h7M9 13h7M9 17h4" />
  </Line>
);

export const IconMensen = (p: IconProps) => (
  <Line {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c.8-3.6 3.2-5.5 6-5.5s5.2 1.9 6 5.5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 14.6c2.2.2 3.8 1.9 4.5 4.4" />
  </Line>
);

export const IconMedaille = (p: IconProps) => (
  <Line {...p}>
    <path d="M8 3l4 6 4-6" />
    <circle cx="12" cy="15" r="6" />
    <path d="M12 12.5v5" />
  </Line>
);

export const IconWifiUit = (p: IconProps) => (
  <Line {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.5M14.8 10.4A10 10 0 0 1 19 12.9M2 9.4a15 15 0 0 1 4.3-2.8M11 5.1A15 15 0 0 1 22 9.4" />
    <path d="M12 20h.01" strokeWidth={3} />
  </Line>
);

export const IconVernieuw = (p: IconProps) => (
  <Line {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 5v6h-6" />
  </Line>
);

export const IconUitloggen = (p: IconProps) => (
  <Line {...p}>
    <path d="M10 4H5v16h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </Line>
);

export const IconHartslag = (p: IconProps) => (
  <Line {...p}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </Line>
);

/** Filled shapes from the style guide. */
export const IconBloem = ({ size = 22, centre = "#3B2417", fill = "#F5AE1B" }: { size?: number; centre?: string; fill?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
    <g fill={fill}>
      <circle cx="12" cy="6.6" r="3.6" />
      <circle cx="16.7" cy="9.3" r="3.6" />
      <circle cx="16.7" cy="14.7" r="3.6" />
      <circle cx="12" cy="17.4" r="3.6" />
      <circle cx="7.3" cy="14.7" r="3.6" />
      <circle cx="7.3" cy="9.3" r="3.6" />
    </g>
    <circle cx="12" cy="12" r="2.8" fill={centre} />
  </svg>
);

/** The four answer-tile symbols: sun, flower, star and moon (style guide). */
export function AntwoordSymbool({ soort, size = 28 }: { soort: "zon" | "bloem" | "ster" | "maan"; size?: number }) {
  const ink = "#2B1810";
  if (soort === "zon") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.6" fill={ink} />
        <path
          d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
          stroke={ink}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (soort === "bloem") return <IconBloem size={size} fill={ink} centre="#F5AE1B" />;
  if (soort === "ster") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={ink} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={ink} />
    </svg>
  );
}

export const IconJoker = (p: IconProps) => (
  <svg aria-hidden="true" width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M12 8l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="currentColor" stroke="none" />
  </svg>
);
