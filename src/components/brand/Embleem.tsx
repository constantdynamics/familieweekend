import { useId } from "react";

/**
 * Voorlopig embleem: een valk in een lauwerkrans (uit de designreferentie).
 * Wordt vervangen door het echte logo; de iconen komen dan uit
 * `public/brand/embleem.svg` via `npm run icons`.
 */
const LEAVES: [number, number, number, number, number, string][] = [
  [68.1, 187.1, 11.5, 5.0, 167.0, "#A7B43A"],
  [82.6, 173.9, 11.5, 5.0, 228.0, "#8C9A2A"],
  [47.8, 175.8, 11.2, 4.8, 182.0, "#A7B43A"],
  [65.0, 167.2, 11.2, 4.8, 243.0, "#8C9A2A"],
  [31.3, 159.7, 10.8, 4.7, 197.0, "#A7B43A"],
  [49.7, 156.1, 10.8, 4.7, 258.0, "#8C9A2A"],
  [19.4, 139.9, 10.5, 4.5, 212.0, "#A7B43A"],
  [37.7, 141.5, 10.5, 4.5, 273.0, "#8C9A2A"],
  [13.2, 117.8, 10.1, 4.4, 227.0, "#A7B43A"],
  [29.9, 124.1, 10.1, 4.4, 288.0, "#8C9A2A"],
  [12.8, 94.8, 9.8, 4.2, 242.0, "#A7B43A"],
  [26.8, 105.3, 9.8, 4.2, 303.0, "#8C9A2A"],
  [18.4, 72.7, 9.4, 4.1, 257.0, "#A7B43A"],
  [28.7, 86.2, 9.4, 4.1, 318.0, "#8C9A2A"],
  [29.5, 52.8, 9.1, 4.0, 272.0, "#A7B43A"],
  [35.6, 68.3, 9.1, 4.0, 333.0, "#8C9A2A"],
  [45.3, 36.5, 8.7, 3.8, 287.0, "#A7B43A"],
  [46.8, 52.7, 8.7, 3.8, 348.0, "#8C9A2A"],
  [64.8, 24.9, 8.4, 3.6, 302.0, "#A7B43A"],
  [61.8, 40.4, 8.4, 3.6, 363.0, "#8C9A2A"],
  [131.9, 187.1, 11.5, 5.0, 193.0, "#A7B43A"],
  [117.4, 173.9, 11.5, 5.0, 132.0, "#8C9A2A"],
  [152.2, 175.8, 11.2, 4.8, 178.0, "#A7B43A"],
  [135.0, 167.2, 11.2, 4.8, 117.0, "#8C9A2A"],
  [168.7, 159.7, 10.8, 4.7, 163.0, "#A7B43A"],
  [150.3, 156.1, 10.8, 4.7, 102.0, "#8C9A2A"],
  [180.6, 139.9, 10.5, 4.5, 148.0, "#A7B43A"],
  [162.3, 141.5, 10.5, 4.5, 87.0, "#8C9A2A"],
  [186.8, 117.8, 10.1, 4.4, 133.0, "#A7B43A"],
  [170.1, 124.1, 10.1, 4.4, 72.0, "#8C9A2A"],
  [187.2, 94.8, 9.8, 4.2, 118.0, "#A7B43A"],
  [173.2, 105.3, 9.8, 4.2, 57.0, "#8C9A2A"],
  [181.6, 72.7, 9.4, 4.1, 103.0, "#A7B43A"],
  [171.3, 86.2, 9.4, 4.1, 42.0, "#8C9A2A"],
  [170.5, 52.8, 9.1, 4.0, 88.0, "#A7B43A"],
  [164.4, 68.3, 9.1, 4.0, 27.0, "#8C9A2A"],
  [154.7, 36.5, 8.7, 3.8, 73.0, "#A7B43A"],
  [153.2, 52.7, 8.7, 3.8, 12.0, "#8C9A2A"],
  [135.2, 24.9, 8.4, 3.6, 58.0, "#A7B43A"],
  [138.2, 40.4, 8.4, 3.6, -3.0, "#8C9A2A"],
];

type Props = {
  size?: number;
  className?: string;
  /** Leave empty when the emblem is purely decorative next to the name. */
  label?: string;
};

export function Embleem({ size = 96, className, label }: Props) {
  const clipId = `embleem-${useId().replace(/:/g, "")}`;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className={className} {...a11y}>
      <clipPath id={clipId}>
        <circle cx="100" cy="104" r="62" />
      </clipPath>
      <circle cx="100" cy="104" r="62" fill="#F06A1F" />
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M70 82 C80 60 112 52 132 66 C146 76 150 98 146 120 C143 138 140 152 142 170 L78 170 C80 152 82 140 78 128 C72 116 66 104 70 82 Z"
          fill="#F5AE1B"
        />
        <path
          d="M72 80 C84 60 114 54 132 66 C144 75 148 92 146 108 C136 100 124 98 114 101 C112 112 106 124 98 132 C96 120 94 108 90 100 C84 95 77 93 70 92 Z"
          fill="#2B1810"
        />
        <path
          d="M76 98 C86 97 92 103 94 112 C96 124 94 138 88 150 C82 144 78 134 77 124 C76 114 74 106 76 98 Z"
          fill="#FCEBD0"
        />
        <path d="M120 112 C130 116 136 128 136 142 C130 136 124 132 116 132 Z" fill="#E0951A" />
        <path
          d="M71 80 C62 79 52 84 48 94 C46 101 49 107 54 106 C54 100 59 96 66 97 C68 92 69 86 71 80 Z"
          fill="#2B1810"
        />
        <path d="M71 80 C67 80 63 82 61 85 C64 86 67 89 68 93 C69 89 70 84 71 80 Z" fill="#F5AE1B" />
        <circle cx="88" cy="84" r="9.5" fill="#F5AE1B" />
        <circle cx="88" cy="84" r="6.2" fill="#140B06" />
        <circle cx="90.2" cy="81.8" r="2" fill="#FCEBD0" />
      </g>
      <circle cx="100" cy="104" r="62" fill="none" stroke="#F5AE1B" strokeWidth="4" />
      <path d="M88.9 183.2 A80 80 0 0 1 67.5 30.9" fill="none" stroke="#6F7F1F" strokeWidth="3" strokeLinecap="round" />
      <path d="M111.1 183.2 A80 80 0 0 0 132.5 30.9" fill="none" stroke="#6F7F1F" strokeWidth="3" strokeLinecap="round" />
      {LEAVES.map(([cx, cy, rx, ry, rotate, fill]) => (
        <ellipse
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          transform={`rotate(${rotate} ${cx} ${cy})`}
          fill={fill}
        />
      ))}
      <path d="M100 182 L88 176 L90 190 Z M100 182 L112 176 L110 190 Z" fill="#F06A1F" />
      <circle cx="100" cy="182" r="4.5" fill="#F5AE1B" />
    </svg>
  );
}
