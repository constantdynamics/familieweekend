/**
 * iOS start screens (portrait only, the app is portrait-only). Shared by the
 * root layout (the <link> tags) and `scripts/generate-icons.ts` (the PNGs).
 */
export type SplashSize = { width: number; height: number; ratio: number };

export const SPLASH_SIZES: SplashSize[] = [
  // iPhones
  { width: 440, height: 956, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 414, height: 896, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 375, height: 667, ratio: 2 },
  { width: 320, height: 568, ratio: 2 },
  // iPads
  { width: 1032, height: 1376, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 834, height: 1210, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 834, height: 1112, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
  { width: 744, height: 1133, ratio: 2 },
];

export function splashFileName({ width, height, ratio }: SplashSize): string {
  return `splash-${width * ratio}x${height * ratio}.png`;
}

export function iosStartupImages() {
  return SPLASH_SIZES.map((size) => ({
    url: `/splash/${splashFileName(size)}`,
    media: `(device-width: ${size.width}px) and (device-height: ${size.height}px) and (-webkit-device-pixel-ratio: ${size.ratio}) and (orientation: portrait)`,
  }));
}
