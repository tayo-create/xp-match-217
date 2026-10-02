import type { Place, PlaceKind } from "@/lib/types";

/** OpenStreetMap Nominatim: free worldwide place search. Fair use is about one request per second. */
const BASE = "https://nominatim.openstreetmap.org";

interface NominatimHit {
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
}

const EAT = new Set(["restaurant", "cafe", "fast_food", "food_court", "bakery", "ice_cream", "deli", "pastry", "confectionery"]);
const NIGHT = new Set(["bar", "pub", "nightclub", "biergarten", "wine_bar", "cocktail_bar"]);
const STAY = new Set(["hotel", "hostel", "guest_house", "motel", "apartment", "chalet", "resort"]);
const MOVE = new Set(["station", "bus_station", "ferry_terminal", "tram_stop", "aerodrome", "subway_entrance"]);

const kindOf = (h: NominatimHit): PlaceKind => {
  const t = h.type ?? "";
  if (EAT.has(t)) return "eat";
  if (NIGHT.has(t)) return "nightlife";
  if (STAY.has(t)) return "stay";
  if (MOVE.has(t)) return "move";
  return "do";
};

const KIND_TAGS: Record<PlaceKind, string[]> = { eat: ["local-favorite"], nightlife: ["nightlife", "social"], stay: ["boutique"], do: ["history"], move: ["scenic-route"] };

const toPlace = (h: NominatimHit): Place | null => {
  const lat = Number(h.lat);
  const lng = Number(h.lon);
  const a = h.address ?? {};
  const name = h.name || h.display_name.split(",")[0];
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const kind = kindOf(h);
  return {
    id: `osm-${(h.osm_type ?? "n")[0]}${h.osm_id ?? Math.round(lat * 1e5)}`,
    name,
    kind,
    neighborhood: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.road || "",
    city: a.city || a.town || a.village || a.municipality || a.county || "",
    price: 2,
    blurb: h.display_name.split(",").slice(0, 3).join(",").trim(),
    tags: KIND_TAGS[kind],
    affinity: { curator: 50, drifter: 50, trailblazer: 50, architect: 50 },
    lat,
    lng,
    custom: true,
  };
};

/** Searches places anywhere in the world by name. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${BASE}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Place search is busy. Try again in a moment.");
  const hits = (await res.json()) as NominatimHit[];
  return hits.map(toPlace).filter((p): p is Place => p !== null);
}

/** The named place (or street) at a coordinate. */
export async function reversePlace(lat: number, lng: number): Promise<Place | null> {
  try {
    const res = await fetch(`${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const hit = (await res.json()) as NominatimHit & { error?: string };
    if (hit.error) return null;
    const place = toPlace(hit);
    return place ? { ...place, lat, lng } : null;
  } catch {
    return null;
  }
}

export const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));
