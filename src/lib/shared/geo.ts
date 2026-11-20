/**
 * Distances and points for map questions (SPEC §5.4). Pure functions.
 */

export type LatLng = { lat: number; lng: number };

/** Mean radius of the earth, as in the usual haversine formula. */
export const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two points (haversine formula). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  // Rounding can push h a hair above 1 for points on opposite sides of the earth.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The two scales of §5.4, set per question. */
export type MapScale = "nederland" | "wereld";

/**
 * Upper limits in km for 3, 2 and 1 point. A limit itself still counts:
 * exactly 5 km on the scale "nederland" is 3 points.
 */
export const MAP_BANDS = {
  nederland: [5, 20, 75],
  wereld: [100, 500, 1500],
} as const satisfies Record<MapScale, readonly [number, number, number]>;

export function isMapScale(value: unknown): value is MapScale {
  return value === "nederland" || value === "wereld";
}

/** 0 to 3 points for a pin at `distanceKm` from the right place. Nonsense input gives 0. */
export function mapPoints(distanceKm: number, scale: MapScale): 0 | 1 | 2 | 3 {
  if (!isMapScale(scale) || !Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const [three, two, one] = MAP_BANDS[scale];
  if (distanceKm <= three) return 3;
  if (distanceKm <= two) return 2;
  if (distanceKm <= one) return 1;
  return 0;
}
