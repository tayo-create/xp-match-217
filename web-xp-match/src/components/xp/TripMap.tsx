import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { memo, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { legBetween } from "@/lib/geo";
import type { Place } from "@/lib/types";

/** Day colors for multi-day maps, drawn from the brand and traveler-type palette. */
export const DAY_COLORS = ["#C8452D", "#1F2A44", "#5E9C7C", "#D9A43A", "#E08A6A", "#4A6FA5", "#8C5A9E", "#2E8C8C"];
export const dayColor = (day: number): string => DAY_COLORS[day % DAY_COLORS.length];

export interface MapStop {
  id: string;
  place: Place;
  time: string;
  day: number;
}

const pinIcon = (n: number, color: string, active: boolean, fresh: boolean, small: boolean): L.DivIcon => {
  const w = small ? 28 : 34;
  const h = small ? 36 : 44;
  return L.divIcon({
    className: "xp-pin",
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2],
    html: `<div class="xp-pin-wrap${fresh ? " is-fresh" : ""}${active ? " is-active" : ""}" style="--pin:${color}">
      ${fresh ? `<span class="xp-pin-ring" style="width:${w}px;height:${w}px"></span>` : ""}
      <svg width="${w}" height="${h}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z" fill="${active ? "#1F2A44" : color}" stroke="#fff" stroke-width="2.4"/>
        <text x="17" y="21.5" text-anchor="middle" font-family="Instrument Sans, sans-serif" font-size="${n > 9 ? 11.5 : 13}" font-weight="700" fill="#fff">${n}</text>
      </svg>
    </div>`,
  });
};

/** Suggested (not yet planned) picks: a hollow navy ring with a terracotta core. */
const suggestIcon = (active: boolean): L.DivIcon =>
  L.divIcon({
    className: "xp-pin",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div class="xp-suggest${active ? " is-active" : ""}"><span></span></div>`,
  });

const legIcon = (label: string): L.DivIcon =>
  L.divIcon({ className: "xp-leg", iconSize: [0, 0], html: `<span class="xp-leg-chip">${label}</span>` });

function FitBounds({ points, center, padding }: { points: [number, number][]; center: [number, number]; padding: number }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    const pts = JSON.parse(key) as [number, number][];
    if (pts.length === 0) map.setView(center, 13);
    else if (pts.length === 1) map.setView(pts[0], 14);
    else map.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom: 15 });
  }, [map, key, center, padding]);
  return null;
}

/** Leaflet needs a nudge when its container changes size (sheets, collapsing menus). */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Flies to a chosen place whenever `focusKey` changes (e.g. a pick was tapped in the chat). */
function FlyTo({ pos, focusKey }: { pos?: [number, number]; focusKey?: string }) {
  const map = useMap();
  const posRef = useRef<[number, number] | undefined>(pos);
  posRef.current = pos;
  useEffect(() => {
    const p = posRef.current;
    if (!focusKey || !p) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Let FitBounds settle first when the stop list changed in the same render.
    const t = window.setTimeout(() => map.flyTo(p, Math.max(map.getZoom(), 15), { animate: !still, duration: 0.7 }), 60);
    return () => window.clearTimeout(t);
  }, [map, focusKey]);
  return null;
}

function PanTo({ stop }: { stop?: MapStop }) {
  const map = useMap();
  useEffect(() => {
    if (!stop) return;
    const ll = L.latLng(stop.place.lat, stop.place.lng);
    if (!map.getBounds().pad(-0.15).contains(ll)) map.panTo(ll, { animate: true });
  }, [map, stop]);
  return null;
}

interface Props {
  stops: MapStop[];
  center: [number, number];
  activeId?: string;
  onSelect?: (id: string) => void;
  freshIds?: Set<string>;
  /** Color pins and route by day; numbers run chronologically across the trip. */
  multiDay?: boolean;
  /** Always-visible name labels (otherwise shown on hover). */
  labels?: boolean;
  /** Walking/ride estimates at the middle of each hop. */
  legs?: boolean;
  compact?: boolean;
  /** Places shown as unnumbered "suggested" pins (picks not on the itinerary yet). Selected as `pick:<placeId>`. */
  extras?: Place[];
  /** Overrides the pin number per stop id (keeps numbers stable when the list is filtered). */
  numbers?: Record<string, number>;
  /** Fly to this position whenever `focusKey` changes. */
  focus?: [number, number];
  focusKey?: string;
}

/**
 * Map of itinerary stops in chronological order, connected by a route line.
 * Single-day mode draws one terracotta route; multi-day mode colors each day and
 * joins consecutive days with a faint dashed hop.
 */
export const TripMap = memo(function TripMap({
  stops,
  center,
  activeId,
  onSelect,
  freshIds,
  multiDay = false,
  labels = true,
  legs = false,
  compact = false,
  extras,
  numbers,
  focus,
  focusKey,
}: Props) {
  const points = useMemo<[number, number][]>(
    () => [...stops.map((s) => [s.place.lat, s.place.lng] as [number, number]), ...(extras ?? []).map((p) => [p.lat, p.lng] as [number, number])],
    [stops, extras],
  );

  const routes = useMemo(() => {
    const byDay: { day: number; pts: [number, number][] }[] = [];
    stops.forEach((s) => {
      const last = byDay[byDay.length - 1];
      if (last && last.day === s.day) last.pts.push([s.place.lat, s.place.lng]);
      else byDay.push({ day: s.day, pts: [[s.place.lat, s.place.lng]] });
    });
    const bridges: [number, number][][] = [];
    for (let i = 1; i < byDay.length; i++) bridges.push([byDay[i - 1].pts[byDay[i - 1].pts.length - 1], byDay[i].pts[0]]);
    return { byDay, bridges };
  }, [stops]);

  const legMarkers = useMemo(() => {
    if (!legs) return [];
    const out: { id: string; pos: [number, number]; label: string }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (a.day !== b.day) continue;
      const leg = legBetween(a.place, b.place);
      out.push({ id: `${a.id}-${b.id}`, pos: [(a.place.lat + b.place.lat) / 2, (a.place.lng + b.place.lng) / 2], label: `${leg.minutes} min ${leg.mode === "walk" ? "walk" : "ride"}` });
    }
    return out;
  }, [stops, legs]);

  const active = stops.find((s) => s.id === activeId);

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl zoomControl={!compact}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <AutoResize />
      <FitBounds points={points} center={center} padding={compact ? 28 : 56} />
      <PanTo stop={active} />
      <FlyTo pos={focus} focusKey={focusKey} />
      {routes.bridges.map((pts, i) => (
        <Polyline key={`b${i}`} positions={pts} pathOptions={{ color: "#1F2A44", weight: 2, opacity: 0.35, dashArray: "2 7", lineCap: "round" }} />
      ))}
      {routes.byDay.map((r, i) =>
        r.pts.length > 1 ? (
          <Polyline key={`c${i}`} positions={r.pts} pathOptions={{ color: "#ffffff", weight: compact ? 6 : 8, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
        ) : null,
      )}
      {routes.byDay.map((r, i) =>
        r.pts.length > 1 ? (
          <Polyline
            key={`r${i}`}
            positions={r.pts}
            pathOptions={{ color: multiDay ? dayColor(r.day) : "#C8452D", weight: compact ? 3 : 4, lineCap: "round", lineJoin: "round", className: "xp-route" }}
          />
        ) : null,
      )}
      {legMarkers.map((l) => (
        <Marker key={l.id} position={l.pos} icon={legIcon(l.label)} interactive={false} keyboard={false} />
      ))}
      {(extras ?? []).map((p) => {
        const id = `pick:${p.id}`;
        return (
          <Marker key={id} position={[p.lat, p.lng]} icon={suggestIcon(id === activeId)} zIndexOffset={id === activeId ? 1000 : -100} eventHandlers={{ click: () => onSelect?.(id) }} title={`Suggested: ${p.name}`}>
            <Tooltip direction="right" offset={[12, 0]} className="xp-tip">
              Suggested · {p.name}
            </Tooltip>
          </Marker>
        );
      })}
      {stops.map((s, i) => (
        <Marker
          key={s.id}
          position={[s.place.lat, s.place.lng]}
          icon={pinIcon(numbers?.[s.id] ?? i + 1, multiDay ? dayColor(s.day) : "#C8452D", s.id === activeId, freshIds?.has(s.id) ?? false, compact)}
          zIndexOffset={s.id === activeId ? 1000 : freshIds?.has(s.id) ? 500 : 0}
          eventHandlers={{ click: () => onSelect?.(s.id) }}
          title={`${numbers?.[s.id] ?? i + 1}. ${s.place.name}`}
        >
          <Tooltip direction="right" offset={[compact ? 12 : 14, compact ? -18 : -24]} permanent={labels} className="xp-tip">
            {multiDay ? `Day ${s.day + 1} · ` : ""}
            {s.time} · {s.place.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
});
