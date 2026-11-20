import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_KM, MAP_BANDS, haversineKm, isMapScale, mapPoints, type MapScale } from "@/lib/shared/geo";

const GEUL = { lat: 50.865, lng: 5.832 };
const DOMMELVALLEI = { lat: 51.2975, lng: 5.4417 };
/** Km per degree of latitude on this earth. */
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180;

describe("haversine", () => {
  it("meet nul tussen een plek en zichzelf, en is symmetrisch", () => {
    expect(haversineKm(GEUL, GEUL)).toBe(0);
    expect(haversineKm(GEUL, DOMMELVALLEI)).toBe(haversineKm(DOMMELVALLEI, GEUL));
  });

  it("klopt met bekende afstanden op een bol van 6371 km", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.195, 3);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(10007.543, 3);
    // Opposite sides of the earth: half the circumference, without NaN.
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.087, 3);
    expect(haversineKm({ lat: 52.3676, lng: 4.9041 }, { lat: -52.3676, lng: -175.0959 })).toBeCloseTo(20015.087, 3);
    // Across the date line it takes the short way.
    expect(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(222.39, 2);
  });

  it("meet echte plekken", () => {
    expect(haversineKm(DOMMELVALLEI, GEUL)).toBeCloseTo(55.28, 2);
    expect(haversineKm({ lat: 52.3676, lng: 4.9041 }, { lat: 48.8566, lng: 2.3522 })).toBeCloseTo(429.86, 2);
  });
});

describe("kaartbanden", () => {
  it("heeft de banden van SPEC §5.4", () => {
    expect(MAP_BANDS).toEqual({ nederland: [5, 20, 75], wereld: [100, 500, 1500] });
  });

  const boundaries: [MapScale, number, number][] = [
    ["nederland", 0, 3],
    ["nederland", 5, 3],
    ["nederland", 5 + 1e-9, 2],
    ["nederland", 5.001, 2],
    ["nederland", 20, 2],
    ["nederland", 20.001, 1],
    ["nederland", 75, 1],
    ["nederland", 75.001, 0],
    ["nederland", 500, 0],
    ["wereld", 0, 3],
    ["wereld", 100, 3],
    ["wereld", 100.001, 2],
    ["wereld", 500, 2],
    ["wereld", 500.001, 1],
    ["wereld", 1500, 1],
    ["wereld", 1500.001, 0],
    ["wereld", 20015, 0],
  ];

  it.each(boundaries)("%s: %s km geeft %s", (scale, distance, points) => {
    expect(mapPoints(distance, scale)).toBe(points);
  });

  it("rekent met de echte afstand van een speld", () => {
    const north = (km: number) => ({ lat: GEUL.lat + km / KM_PER_DEGREE, lng: GEUL.lng });
    expect(mapPoints(haversineKm(north(4.9), GEUL), "nederland")).toBe(3);
    expect(mapPoints(haversineKm(north(5.1), GEUL), "nederland")).toBe(2);
    expect(mapPoints(haversineKm(DOMMELVALLEI, GEUL), "nederland")).toBe(1);
    expect(mapPoints(haversineKm(DOMMELVALLEI, GEUL), "wereld")).toBe(3);
  });

  it("geeft 0 voor onzin", () => {
    expect(mapPoints(Number.NaN, "nederland")).toBe(0);
    expect(mapPoints(Number.POSITIVE_INFINITY, "wereld")).toBe(0);
    expect(mapPoints(-1, "nederland")).toBe(0);
    expect(mapPoints(1, "heelal" as MapScale)).toBe(0);
    expect(isMapScale("wereld")).toBe(true);
    expect(isMapScale("Wereld")).toBe(false);
    expect(isMapScale(undefined)).toBe(false);
  });
});
