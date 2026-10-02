import { Flame, Gem, Heart, Landmark, Leaf, Martini, Mountain, UtensilsCrossed, type LucideIcon } from "lucide-react";

import type { CategoryScores, InterestId, Place, PlaceKind, TasteProfile, TripPace, TripSettings } from "@/lib/types";

export interface InterestDef {
  id: InterestId;
  label: string;
  blurb: string;
  icon: LucideIcon;
  tags: string[];
  kinds: PlaceKind[];
  boost: Partial<CategoryScores>;
}

export const INTERESTS: InterestDef[] = [
  {
    id: "foodie",
    label: "Foodie",
    blurb: "Meals are the itinerary",
    icon: UtensilsCrossed,
    tags: ["steak", "meat", "seafood", "street-food", "chef-driven", "market", "food-hall", "pastry", "ramen", "small-plates", "portuguese", "dry-aged", "breakfast"],
    kinds: ["eat"],
    boost: { eat: 18 },
  },
  {
    id: "adventure",
    label: "Adventure",
    blurb: "Big days, early starts",
    icon: Flame,
    tags: ["adventure", "active", "day-trip", "hidden-viewpoint", "scenic-route", "city-walks"],
    kinds: ["do"],
    boost: { do: 18, move: 8 },
  },
  {
    id: "relaxing",
    label: "Relaxing",
    blurb: "Slow mornings, no rush",
    icon: Leaf,
    tags: ["slow", "quiet", "garden", "cozy", "intimate", "sunset", "boutique"],
    kinds: ["stay", "do"],
    boost: { stay: 14, do: -6 },
  },
  {
    id: "culture",
    label: "Culture",
    blurb: "Museums, history, design",
    icon: Landmark,
    tags: ["museum", "art", "history", "palace", "design", "fado", "iconic"],
    kinds: ["do"],
    boost: { do: 14 },
  },
  {
    id: "nightlife",
    label: "Nightlife",
    blurb: "Bars, music, late nights",
    icon: Martini,
    tags: ["nightlife", "cocktails", "live-music", "rooftop", "social", "natural-wine", "wine"],
    kinds: ["nightlife"],
    boost: { eat: 8 },
  },
  {
    id: "hidden-gems",
    label: "Hidden gems",
    blurb: "Where locals actually go",
    icon: Gem,
    tags: ["hidden-gem", "local-favorite", "hidden-viewpoint", "quiet"],
    kinds: ["eat", "do"],
    boost: {},
  },
  {
    id: "romantic",
    label: "Romantic",
    blurb: "Sunsets and candlelight",
    icon: Heart,
    tags: ["sunset", "intimate", "wine", "rooftop", "viewpoint", "boutique"],
    kinds: ["eat", "nightlife"],
    boost: { stay: 8 },
  },
  {
    id: "outdoors",
    label: "Outdoors",
    blurb: "Views, gardens, fresh air",
    icon: Mountain,
    tags: ["viewpoint", "garden", "scenic-route", "day-trip", "city-walks", "photography"],
    kinds: ["do", "move"],
    boost: { do: 10, move: 10 },
  },
];

export const INTEREST_BY_ID: Record<InterestId, InterestDef> = Object.fromEntries(INTERESTS.map((i) => [i.id, i])) as Record<InterestId, InterestDef>;

export const PACES: { id: TripPace; label: string; blurb: string; cap: number }[] = [
  { id: "relaxed", label: "Relaxed", blurb: "Up to 3 stops a day", cap: 3 },
  { id: "balanced", label: "Balanced", blurb: "Up to 5 stops a day", cap: 5 },
  { id: "packed", label: "Packed", blurb: "See it all, up to 7", cap: 7 },
];

export const DEFAULT_SETTINGS: TripSettings = { interests: [], pace: "balanced", notes: "" };

export const paceCap = (pace: TripPace | undefined): number => PACES.find((p) => p.id === pace)?.cap ?? 5;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Folds a trip's interests into the traveler's Taste Profile: interest tags count as likes
 * and category coefficients shift, so the match engine and the AI both lean toward them.
 */
export const applyTripSettings = (profile: TasteProfile, settings?: TripSettings): TasteProfile => {
  if (!settings?.interests.length) return profile;
  const likes = new Set(profile.likes);
  const categories = { ...profile.categories };
  for (const id of settings.interests) {
    const def = INTEREST_BY_ID[id];
    if (!def) continue;
    def.tags.forEach((t) => likes.add(t));
    (Object.keys(def.boost) as (keyof CategoryScores)[]).forEach((c) => {
      categories[c] = clamp(categories[c] + (def.boost[c] ?? 0), 12, 99);
    });
  }
  return { ...profile, likes: [...likes], dislikes: profile.dislikes.filter((d) => !likes.has(d)), categories };
};

/** Interests on this trip that a place speaks to, for "Fits your Foodie focus" hints. */
export const interestsFor = (place: Place, settings?: TripSettings): InterestDef[] =>
  (settings?.interests ?? []).map((id) => INTEREST_BY_ID[id]).filter((d): d is InterestDef => Boolean(d) && (d.tags.some((t) => place.tags.includes(t)) || d.kinds.includes(place.kind)));
