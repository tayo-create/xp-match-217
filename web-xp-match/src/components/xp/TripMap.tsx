import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { memo, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { legChip, legId, useLegs, type LegPair, type RoutedLeg } from "@/lib/routing";
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

const WALK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/></svg>';
const RIDE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/></svg>';

const legIcon = (leg: RoutedLeg, color: string): L.DivIcon =>
  L.divIcon({
    className: "xp-leg",
    iconSize: [0, 0],
    html: `<span class="xp-leg-chip" style="--leg:${color}">${leg.mode === "walk" ? WALK_SVG : RIDE_SVG}${legChip(leg)}</span>`,
  });

/** The point halfway along a path, measured by length, so chips sit on the street line rather than off it. */
const midpoint = (path: [number, number][]): [number, number] => {
  if (path.length < 2) return path[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], (path[i][1] - path[i - 1][1]) * Math.cos((path[i][0] * Math.PI) / 180));
    seg.push(d);
    total += d;
  }
  let walked = 0;
  for (let i = 0; i < seg.length; i++) {
    if (walked + seg[i] >= total / 2) {
      const t = seg[i] ? (total / 2 - walked) / seg[i] : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    walked += seg[i];
  }
  return path[path.length - 1];
};

/**
 * Frames `points`. The first fit is instant; later ones (a new day scrolled into view, a stop swapped)
 * glide there after a short pause so fast scrolling doesn't jerk the map. Paused while a single place is focused.
 */
function FitBounds({ points, center, padding, maxZoom, paused }: { points: [number, number][]; center: [number, number]; padding: number; maxZoom: number; paused: boolean }) {
  const map = useMap();
  const key = JSON.stringify(points);
  const first = useRef<boolean>(true);
  useEffect(() => {
    if (paused) return;
    const pts = JSON.parse(key) as [number, number][];
    const still = first.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.current = false;
    const run = () => {
      if (pts.length === 0) map.setView(center, 13, { animate: !still });
      else if (pts.length === 1) {
        if (still) map.setView(pts[0], Math.min(15, maxZoom));
        else map.flyTo(pts[0], Math.min(15, maxZoom), { duration: 0.6 });
      } else {
        const bounds = L.latLngBounds(pts);
        if (still) map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
        else map.flyToBounds(bounds, { padding: [padding, padding], maxZoom, duration: 0.6 });
      }
    };
    if (still) {
      run();
      return;
    }
    const t = window.setTimeout(run, 140);
    return () => window.clearTimeout(t);
  }, [map, key, center, padding, maxZoom, paused]);
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
  /** Time and distance chips on each hop (only the focused day's hops when `focusDay` is set). */
  legs?: boolean;
  /** Frames this day's stops and fades the other days (e.g. the day scrolled into view in the itinerary). */
  focusDay?: number;
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
 * Map of itinerary stops in chronological order, joined along real streets: walks as a dotted footpath,
 * rides as a solid line (straight-line estimates until each route arrives).
 * Single-day mode draws terracotta routes; multi-day mode colors each day and joins
 * consecutive days with a faint dashed hop.
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
  focusDay,
}: Props) {
  const dayHasStops = focusDay !== undefined && stops.some((s) => s.day === focusDay);
  const spotlight = dayHasStops ? focusDay : undefined;

  const points = useMemo<[number, number][]>(() => {
    if (spotlight !== undefined) return stops.filter((s) => s.day === spotlight).map((s) => [s.place.lat, s.place.lng] as [number, number]);
    return [...stops.map((s) => [s.place.lat, s.place.lng] as [number, number]), ...(extras ?? []).map((p) => [p.lat, p.lng] as [number, number])];
  }, [stops, extras, spotlight]);

  const pairs = useMemo<(LegPair & { day: number })[]>(() => {
    const out: (LegPair & { day: number })[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (a.day === b.day) out.push({ id: legId(a, b), a: a.place, b: b.place, day: a.day });
    }
    return out;
  }, [stops]);
  const routed = useLegs(pairs);

  const bridges = useMemo(() => {
    const out: { day: number; pts: [number, number][] }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (a.day !== b.day) out.push({ day: b.day, pts: [[a.place.lat, a.place.lng], [b.place.lat, b.place.lng]] });
    }
    return out;
  }, [stops]);

  const hops = pairs.map((p) => ({ ...p, leg: routed.get(p.id) })).filter((h): h is LegPair & { day: number; leg: RoutedLeg } => Boolean(h.leg));
  const colorOf = (day: number): string => (multiDay ? dayColor(day) : "#C8452D");
  const dimmed = (day: number): boolean => spotlight !== undefined && day !== spotlight;
  const active = stops.find((s) => s.id === activeId);

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl zoomControl={!compact}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <AutoResize />
      <FitBounds points={points} center={center} padding={compact ? 32 : 56} maxZoom={spotlight !== undefined ? 16 : 15} paused={Boolean(focusKey)} />
      <PanTo stop={active} />
      <FlyTo pos={focus} focusKey={focusKey} />
      {bridges.map((b, i) => (
        <Polyline key={`b${i}`} positions={b.pts} pathOptions={{ color: "#1F2A44", weight: 2, opacity: spotlight !== undefined ? 0.15 : 0.35, dashArray: "2 7", lineCap: "round" }} />
      ))}
      {hops.map((h) => (
        <Polyline
          key={`c-${h.id}-${h.leg.routed}`}
          positions={h.leg.path}
          pathOptions={{ color: "#ffffff", weight: compact ? 7 : 9, opacity: dimmed(h.day) ? 0.4 : 0.92, lineCap: "round", lineJoin: "round" }}
        />
      ))}
      {hops.map((h) => {
        const walk = h.leg.mode === "walk";
        return (
          <Polyline
            key={`r-${h.id}-${h.leg.routed}`}
            positions={h.leg.path}
            pathOptions={{
              color: colorOf(h.day),
              weight: walk ? (compact ? 4 : 5) : compact ? 3.5 : 4.5,
              opacity: dimmed(h.day) ? 0.28 : h.leg.routed ? 1 : 0.55,
              dashArray: walk ? "0.5 7.5" : h.leg.routed ? undefined : "6 6",
              lineCap: "round",
              lineJoin: "round",
              className: walk || !h.leg.routed ? "xp-walk" : "xp-route",
            }}
          />
        );
      })}
      {legs
        ? hops
            .filter((h) => spotlight === undefined || h.day === spotlight)
            .map((h) => <Marker key={`l-${h.id}`} position={midpoint(h.leg.path)} icon={legIcon(h.leg, colorOf(h.day))} interactive={false} keyboard={false} zIndexOffset={-200} />)
        : null}
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
          icon={pinIcon(numbers?.[s.id] ?? i + 1, colorOf(s.day), s.id === activeId, freshIds?.has(s.id) ?? false, compact)}
          opacity={dimmed(s.day) && s.id !== activeId ? 0.45 : 1}
          zIndexOffset={s.id === activeId ? 1000 : freshIds?.has(s.id) ? 500 : dimmed(s.day) ? -50 : 100}
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
