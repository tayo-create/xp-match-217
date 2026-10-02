import { PLACE_BY_ID } from "@/data/places";
import type { ListTier, Place, PlaceKind, Trip } from "@/lib/types";

/** A place as stored in a feed post (no taste affinity). */
export interface PlaceSnap {
  id: string;
  name: string;
  kind: string;
  city: string;
  neighborhood: string;
  cuisine?: string;
  price: number;
  image?: string;
  tags: string[];
  lat: number;
  lng: number;
  blurb: string;
  custom?: boolean;
}

export interface TripSnap {
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  cover: string;
  days: { items: { time: string; place: PlaceSnap; note?: string }[] }[];
}

/** A community feed post: a rated place or a whole trip. */
export interface FeedPost {
  id: string;
  type: "log" | "trip";
  userId: string;
  name: string;
  avatar: string;
  createdAt: number;
  title: string;
  note: string;
  place?: PlaceSnap;
  tier?: ListTier;
  score?: number;
  visitedOn?: string;
  dishes: string[];
  with: string[];
  photos: string[];
  trip?: TripSnap;
  likes: string[];
  copiedBy: string[];
  /** Poster's taste snapshot, used for compatibility. */
  taste?: unknown;
  reportCount?: number;
}

/** Cities a post covers (a rated place's city, or a trip's city). */
export const postCity = (p: FeedPost): string => (p.type === "trip" ? p.trip?.city ?? "" : p.place?.city ?? "");

/** Every coordinate in a post. */
export const postPoints = (p: FeedPost): { lat: number; lng: number }[] =>
  p.type === "trip" ? (p.trip?.days ?? []).flatMap((d) => d.items.map((it) => it.place)) : p.place ? [p.place] : [];

export const normCity = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export interface CommunityScore {
  avg: number;
  count: number;
  loved: number;
  name: string;
}

const KINDS: PlaceKind[] = ["eat", "do", "stay", "nightlife", "move"];

/** Strips a place down to what the feed stores. */
export const toSnap = (p: Place): PlaceSnap => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  city: p.city,
  neighborhood: p.neighborhood,
  cuisine: p.cuisine,
  price: p.price,
  image: p.image,
  tags: p.tags.slice(0, 12),
  lat: p.lat,
  lng: p.lng,
  blurb: p.blurb.slice(0, 400),
  custom: p.custom,
});

/** Full place for a snapshot: the catalog entry when we know it, otherwise a neutral custom place. */
export const placeFromSnap = (s: PlaceSnap): Place =>
  PLACE_BY_ID[s.id] ?? {
    id: s.id,
    name: s.name,
    kind: KINDS.includes(s.kind as PlaceKind) ? (s.kind as PlaceKind) : "do",
    cuisine: s.cuisine,
    neighborhood: s.neighborhood,
    city: s.city,
    price: s.price,
    blurb: s.blurb,
    tags: s.tags,
    affinity: { curator: 50, drifter: 50, trailblazer: 50, architect: 50 },
    lat: s.lat,
    lng: s.lng,
    image: s.image,
    custom: true,
  };

export const tripToSnap = (t: Trip): TripSnap => ({
  city: t.city,
  country: t.country,
  startDate: t.startDate,
  endDate: t.endDate,
  cover: t.cover,
  days: t.days.map((d) => ({ items: d.items.map((it) => ({ time: it.time, place: toSnap(it.place), note: it.note })) })),
});

export const relTime = (ms: number): string => {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const visitLabel = (iso?: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
