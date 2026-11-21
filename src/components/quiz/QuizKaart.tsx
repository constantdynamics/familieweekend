"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { IconSpeld } from "@/components/ui/icons";
import { Knop } from "@/components/ui/Knop";

/**
 * The map of a map question (SPEC §4.6, §5.4), like GeoGuessr: the captain
 * slides the map until the big pin in the middle sits where the photo was
 * taken, and taps "Zet speld hier". Leaflet with OpenStreetMap tiles and
 * their attribution. At the reveal: every team's pin, the real place, and a
 * dashed line between them; when practising also the rings for 3, 2 and 1
 * point around the real place.
 */

/** The ring colours for 3, 2 and 1 point, also used in the legend under the map. */
export const RING_KLEUREN = ["#A7B43A", "#F5AE1B", "#B4441A"] as const;

export type Speld = { lat: number; lng: number };
export type TeamSpeld = Speld & { id: string; naam: string; kleur: string; licht: boolean };

const BEGIN = {
  nederland: { center: [52.15, 5.3] as [number, number], zoom: 7, pinZoom: 9 },
  wereld: { center: [38, 8] as [number, number], zoom: 2, pinZoom: 4 },
};

const TEGELS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const BRON = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function teamIcoon(kleur: string, letter: string, licht: boolean): string {
  return `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:3px solid #2B1810;background:${kleur};color:${licht ? "#FCEBD0" : "#2B1810"};font:800 15px/1 system-ui,sans-serif;box-shadow:0 3px 0 #140B06">${letter}</span>`;
}

const STER =
  '<span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;border:3px solid #2B1810;background:#F5AE1B;box-shadow:0 3px 0 #140B06">' +
  '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#2B1810"/></svg></span>';

const MIJN =
  '<svg width="40" height="48" viewBox="0 0 40 48" style="filter:none"><path d="M20 46s-15-14-15-26a15 15 0 0 1 30 0c0 12-15 26-15 26z" fill="#F06A1F" stroke="#2B1810" stroke-width="3"/><circle cx="20" cy="19" r="6" fill="#FCEBD0" stroke="#2B1810" stroke-width="2.5"/></svg>';

type Props = {
  schaal: "nederland" | "wereld";
  modus: "kies" | "kijk" | "onthul";
  /** This team's pin (the captain's answer). */
  mijnSpeld: Speld | null;
  onZet?: (speld: Speld) => void;
  bezig?: boolean;
  spelden?: TeamSpeld[];
  goed?: Speld | null;
  /** At the reveal: rings around the real place, in km (3, 2 and 1 point). */
  ringen?: readonly number[];
};

export default function QuizKaart({ schaal, modus, mijnSpeld, onZet, bezig = false, spelden = [], goed = null, ringen }: Props) {
  const houder = useRef<HTMLDivElement>(null);
  const kaart = useRef<LeafletMap | null>(null);
  const laag = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [klaar, setKlaar] = useState(false);
  const modusNu = useRef(modus);
  useEffect(() => {
    modusNu.current = modus;
  }, [modus]);

  // Set up the map once.
  useEffect(() => {
    let weg = false;
    void import("leaflet").then((module) => {
      const L = (module as unknown as { default?: typeof import("leaflet") }).default ?? module;
      if (weg || !houder.current || kaart.current) return;
      leaflet.current = L;
      const begin = BEGIN[schaal];
      const map = L.map(houder.current, {
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 17,
        zoomSnap: 0.5,
      });
      map.attributionControl.setPrefix(false);
      L.control.zoom({ position: "topright", zoomInTitle: "Inzoomen", zoomOutTitle: "Uitzoomen" }).addTo(map);
      L.tileLayer(TEGELS, { maxZoom: 19, attribution: BRON }).addTo(map);
      map.setView(begin.center, begin.zoom);
      map.on("click", (event) => {
        if (modusNu.current === "kies") map.panTo(event.latlng);
      });
      laag.current = L.layerGroup().addTo(map);
      kaart.current = map;
      setKlaar(true);
    });
    return () => {
      weg = true;
      kaart.current?.remove();
      kaart.current = null;
      laag.current = null;
    };
    // The map is made once per question; the markers follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers: this team's pin while choosing, everything at the reveal.
  useEffect(() => {
    const L = leaflet.current;
    const map = kaart.current;
    const group = laag.current;
    if (!klaar || !L || !map || !group) return;
    group.clearLayers();
    const marker = (at: Speld, html: string, size: [number, number], anchor: [number, number]) =>
      L.marker([at.lat, at.lng], {
        icon: L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor }),
        keyboard: false,
        interactive: false,
      }).addTo(group);
    if (modus === "onthul") {
      const punten: [number, number][] = [];
      for (const pin of spelden) {
        marker(pin, teamIcoon(pin.kleur, pin.naam.replace(/^(proef)?team\s+/i, "").charAt(0).toUpperCase(), pin.licht), [30, 30], [15, 15]);
        punten.push([pin.lat, pin.lng]);
        if (goed) L.polyline([[pin.lat, pin.lng], [goed.lat, goed.lng]], { color: "#2B1810", weight: 3, dashArray: "6 8", interactive: false }).addTo(group);
      }
      if (goed) {
        marker(goed, STER, [40, 40], [20, 20]);
        punten.push([goed.lat, goed.lng]);
      }
      const bounds = punten.length > 0 ? L.latLngBounds(punten) : null;
      if (goed && ringen && bounds) {
        // Largest first, so the smaller rings lie on top. The whole outer ring stays in view.
        [...ringen]
          .map((km, index) => ({ km, kleur: RING_KLEUREN[index] ?? RING_KLEUREN[RING_KLEUREN.length - 1] }))
          .reverse()
          .forEach(({ km, kleur }) => {
            const ring = L.circle([goed.lat, goed.lng], { radius: km * 1000, color: kleur, weight: 3, dashArray: "8 6", fillColor: kleur, fillOpacity: 0.07, interactive: false }).addTo(group);
            bounds.extend(ring.getBounds());
          });
      }
      if (bounds && (punten.length > 1 || (goed && ringen))) map.fitBounds(bounds, { padding: [36, 36], maxZoom: schaal === "nederland" ? 11 : 6 });
      else if (punten.length === 1) map.setView(punten[0], BEGIN[schaal].pinZoom);
      return;
    }
    if (mijnSpeld) marker(mijnSpeld, MIJN, [40, 48], [20, 46]);
  }, [klaar, modus, mijnSpeld, spelden, goed, schaal, ringen]);

  // Start at the captain's pin when there is one.
  const eersteSpeld = useRef(false);
  useEffect(() => {
    if (!klaar || eersteSpeld.current || !mijnSpeld || modus === "onthul") return;
    eersteSpeld.current = true;
    kaart.current?.setView([mijnSpeld.lat, mijnSpeld.lng], BEGIN[schaal].pinZoom);
  }, [klaar, mijnSpeld, modus, schaal]);

  const uitleg =
    modus === "kies"
      ? "Kaart. Schuif de kaart tot de speld in het midden op de goede plek staat, en tik dan op Zet speld hier."
      : modus === "onthul"
        ? ringen
          ? "Kaart met de speld, de echte plek en de ringen voor 3, 2 en 1 punt."
          : "Kaart met de spelden van alle teams en de echte plek."
        : "Kaart om mee te zoeken. Alleen de captain zet de speld.";

  return (
    <div className="quiz-kaart flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-kaart border-4 border-beeldbuis shadow-kaart">
        <div ref={houder} role="region" aria-label={uitleg} className="h-[300px] w-full bg-[#cfe3e6]" />
        {modus === "kies" ? (
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <svg width="44" height="54" viewBox="0 0 40 48">
              <path d="M20 46s-15-14-15-26a15 15 0 0 1 30 0c0 12-15 26-15 26z" fill="#F5AE1B" stroke="#2B1810" strokeWidth="3" />
              <circle cx="20" cy="19" r="6" fill="#2B1810" />
            </svg>
          </span>
        ) : null}
      </div>
      {modus === "kies" ? (
        <Knop
          size="groot"
          disabled={bezig || !klaar}
          onClick={() => {
            const center = kaart.current?.getCenter();
            if (center) onZet?.({ lat: center.lat, lng: center.lng });
          }}
        >
          <IconSpeld size={22} />
          {bezig ? "Bezig met versturen…" : mijnSpeld ? "Verplaats je speld hierheen" : "Zet speld hier"}
        </Knop>
      ) : null}
    </div>
  );
}
