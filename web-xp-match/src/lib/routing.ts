import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { distanceKm, formatKm, legBetween, legLabel, rideMinutes, type Leg } from "@/lib/geo";

export interface LatLng {
  lat: number;
  lng: number;
}

/** One hop between two stops: its street path plus real distance and time. `routed` is false while it's still a straight-line estimate. */
export interface RoutedLeg extends Leg {
  path: [number, number][];
  routed: boolean;
}

/** A hop to look up. `id` is how callers find the result again (usually `fromItemId>toItemId`). */
export interface LegPair {
  id: string;
  a: LatLng;
  b: LatLng;
}

/** FOSSGIS's public OSRM servers: free, keyless, CORS-enabled, with separate foot and car graphs. */
const ROUTERS: Record<Leg["mode"], string> = {
  walk: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  ride: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
};
const MAX_PARALLEL = 3;
/** Walks that turn out longer than this on real streets (rivers, highways, hills) become rides. */
const MAX_WALK_KM = 3.2;

export const legId = (a: { id: string }, b: { id: string }): string => `${a.id}>${b.id}`;

/** Consecutive hops within each day. Days never connect to each other. */
export const pairsFor = (days: { id: string; place: LatLng }[][]): LegPair[] =>
  days.flatMap((items) => items.slice(1).map((it, j) => ({ id: legId(items[j], it), a: items[j].place, b: it.place })));

const estimate = (a: LatLng, b: LatLng): RoutedLeg => ({ ...legBetween(a, b), path: [[a.lat, a.lng], [b.lat, b.lng]], routed: false });

/** Map chip text, e.g. "11 min · 850 m". Estimates get a "~". */
export const legChip = (leg: RoutedLeg): string => `${leg.routed || leg.mode === "ride" ? "" : "~"}${leg.minutes} min · ${formatKm(leg.km)}`;

let active = 0;
const waiting: (() => void)[] = [];
/** Keeps the public router happy: at most a few requests in flight. */
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

interface OsrmResponse {
  code?: string;
  routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[];
}

async function osrm(mode: Leg["mode"], a: LatLng, b: LatLng): Promise<{ km: number; seconds: number; path: [number, number][] }> {
  const url = `${ROUTERS[mode]}/${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const res = await slot(() => fetch(url, { signal: AbortSignal.timeout(12000) }));
  if (!res.ok) throw new Error(`Routing ${res.status}`);
  const json = (await res.json()) as OsrmResponse;
  const route = json.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (json.code !== "Ok" || !route || !Array.isArray(coords) || coords.length < 2) throw new Error("No route");
  const path: [number, number][] = [];
  for (const c of coords) {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") path.push([c[1], c[0]]);
  }
  if (path.length < 2) throw new Error("Bad route");
  // Close the small gap between each pin and the nearest street.
  return { km: (route.distance ?? 0) / 1000, seconds: route.duration ?? 0, path: [[a.lat, a.lng], ...path, [b.lat, b.lng]] };
}

/** Fetches the street path for a hop. Walks are routed on footpaths; rides on the road network, with transit-style timing. */
async function fetchLeg(mode: Leg["mode"], a: LatLng, b: LatLng): Promise<RoutedLeg> {
  if (distanceKm(a, b) < 0.03) return { ...estimate(a, b), routed: true };
  if (mode === "walk") {
    const r = await osrm("walk", a, b);
    if (r.km <= MAX_WALK_KM) {
      const minutes = Math.max(2, Math.round(r.seconds / 60));
      return { km: r.km, minutes, mode: "walk", label: legLabel(r.km, minutes, "walk"), path: r.path, routed: true };
    }
  }
  const r = await osrm("ride", a, b);
  const minutes = rideMinutes(r.km);
  return { km: r.km, minutes, mode: "ride", label: legLabel(r.km, minutes, "ride"), path: r.path, routed: true };
}

const routeKey = (mode: Leg["mode"], a: LatLng, b: LatLng): string => `${mode}:${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;

/**
 * Street-level paths, distances and times for each hop, keyed by `pair.id`.
 * Hops show as straight-line estimates until their route arrives (or if routing fails).
 * Results are cached per coordinate pair, so swapping one stop only refetches its two hops.
 */
export function useLegs(pairs: LegPair[]): Map<string, RoutedLeg> {
  const results = useQueries({
    queries: pairs.map((p) => {
      const mode = legBetween(p.a, p.b).mode;
      return {
        queryKey: ["route", routeKey(mode, p.a, p.b)],
        queryFn: () => fetchLeg(mode, p.a, p.b),
        staleTime: Infinity,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
      };
    }),
  });
  const pairsSig = pairs.map((p) => `${p.id}@${routeKey("walk", p.a, p.b)}`).join("|");
  const dataSig = results.map((r) => r.dataUpdatedAt).join(",");
  return useMemo(() => {
    const out = new Map<string, RoutedLeg>();
    pairs.forEach((p, i) => out.set(p.id, results[i]?.data ?? estimate(p.a, p.b)));
    return out;
    // Signatures stand in for the arrays, which are new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsSig, dataSig]);
}

/** Sums the hops of one day. */
export const dayTotals = (legs: RoutedLeg[]): { km: number; minutes: number; walkKm: number } =>
  legs.reduce((t, l) => ({ km: t.km + l.km, minutes: t.minutes + l.minutes, walkKm: t.walkKm + (l.mode === "walk" ? l.km : 0) }), { km: 0, minutes: 0, walkKm: 0 });
