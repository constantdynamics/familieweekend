import type { SVGProps } from "react";
import type { RpsChoice } from "@/lib/shared/rps";

/* Steen, papier en schaar as line icons (SPEC §6.4: never emoji). */

type Props = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Lijn({ size = 48, children, ...rest }: Props & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Steen = (p: Props) => (
  <Lijn {...p}>
    <path d="M9 30c-2-7 2-15 9-17 5-2 12-1 16 3 5 4 6 10 4 15-2 5-7 8-14 8-7 0-13-3-15-9z" />
    <path d="M20 19l4 6-3 5M30 22l-2 7" />
  </Lijn>
);

export const Papier = (p: Props) => (
  <Lijn {...p}>
    <path d="M13 6h15l9 9v27H13z" />
    <path d="M28 6v9h9M18 22h14M18 28h14M18 34h9" />
  </Lijn>
);

export const Schaar = (p: Props) => (
  <Lijn {...p}>
    <circle cx="12" cy="13" r="5" />
    <circle cx="12" cy="35" r="5" />
    <path d="M16.5 15.5L41 32M16.5 32.5L41 16" />
  </Lijn>
);

export const KEUZES: { keuze: RpsChoice; label: string; Icon: (p: Props) => React.ReactNode }[] = [
  { keuze: "steen", label: "Steen", Icon: Steen },
  { keuze: "papier", label: "Papier", Icon: Papier },
  { keuze: "schaar", label: "Schaar", Icon: Schaar },
];

export function KeuzeSymbool({ keuze, size }: { keuze: RpsChoice; size?: number }) {
  const item = KEUZES.find((k) => k.keuze === keuze);
  return item ? <item.Icon size={size} /> : null;
}
