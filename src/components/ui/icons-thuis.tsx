import type { ReactNode, SVGProps } from "react";
import type { WeatherIconKind } from "@/lib/shared/weather";

/**
 * Icons for Thuis during the weekend: the weather, drawn like the design
 * reference (a mustard sun and moon, clouds filled with paper white). Same
 * pattern as icons.tsx: 24 px grid, round caps, decorative (aria-hidden);
 * the text next to them carries the meaning.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };

function Line({ size = 22, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
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

const SUN = "#F5AE1B";
const CLOUD = "#FFF6E6";

/** Cloud on the lower right, for "partly cloudy". */
const CLOUD_LOW = "M17.5 12.5h-.9A5.6 5.6 0 1 0 11 20h6.5a3.75 3.75 0 0 0 0-7.5z";
/** Cloud in the middle. */
const CLOUD_MID = "M16.3 9.5h-.9a5.6 5.6 0 1 0-5.6 7.5h6.5a3.75 3.75 0 0 0 0-7.5z";
/** Cloud a bit higher, with room for rain, snow or lightning below. */
const CLOUD_HIGH = "M17 8h-.8a5.5 5.5 0 1 0-5.5 7H17a3.5 3.5 0 0 0 0-7z";

export const IconWeerZon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="4" fill={SUN} />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </Line>
);

export const IconWeerMaan = (p: IconProps) => (
  <Line {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill={SUN} />
  </Line>
);

export const IconWeerZonWolk = (p: IconProps) => (
  <Line {...p}>
    <circle cx="8" cy="8" r="3.2" fill={SUN} />
    <path d="M8 2.6v1.2M2.6 8h1.2M4.2 4.2l.9.9M11.8 4.2l-.9.9" />
    <path d={CLOUD_LOW} fill={CLOUD} />
  </Line>
);

export const IconWeerMaanWolk = (p: IconProps) => (
  <Line {...p}>
    <path d="M11.2 7.6A4 4 0 1 1 6.4 2.8a3.2 3.2 0 0 0 4.8 4.8z" fill={SUN} />
    <path d={CLOUD_LOW} fill={CLOUD} />
  </Line>
);

export const IconWeerWolk = (p: IconProps) => (
  <Line {...p}>
    <path d={CLOUD_MID} fill={CLOUD} />
  </Line>
);

export const IconWeerRegen = (p: IconProps) => (
  <Line {...p}>
    <path d={CLOUD_HIGH} fill={CLOUD} />
    <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />
  </Line>
);

export const IconWeerSneeuw = (p: IconProps) => (
  <Line {...p}>
    <path d={CLOUD_HIGH} fill={CLOUD} />
    <path d="M8.5 18.5h.01M12.5 20.5h.01M16.5 18.5h.01" strokeWidth={3} />
  </Line>
);

export const IconWeerOnweer = (p: IconProps) => (
  <Line {...p}>
    <path d={CLOUD_HIGH} fill={CLOUD} />
    <path d="M13 15.5l-2.5 3.5h3L11 22.5" />
  </Line>
);

export const IconWeerMist = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 8h16M6 12h12M4 16h16M8 20h8" />
  </Line>
);

const WEER: Record<WeatherIconKind, (p: IconProps) => ReactNode> = {
  zon: IconWeerZon,
  maan: IconWeerMaan,
  "zon-wolk": IconWeerZonWolk,
  "maan-wolk": IconWeerMaanWolk,
  wolk: IconWeerWolk,
  mist: IconWeerMist,
  regen: IconWeerRegen,
  sneeuw: IconWeerSneeuw,
  onweer: IconWeerOnweer,
};

export function WeerIcoon({ soort, ...p }: IconProps & { soort: WeatherIconKind }) {
  const Icon = WEER[soort];
  return <Icon {...p} />;
}
