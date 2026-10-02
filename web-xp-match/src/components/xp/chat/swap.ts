import { scoreForPeople, type TripPerson } from "@/hooks/use-trip-people";
import { distanceKm } from "@/lib/geo";
import { sameCity } from "@/lib/livePlaces";
import type { ItineraryItem, Place, PlaceKind, Trip } from "@/lib/types";

export interface SwapOption {
  place: Place;
  /** Group score (or the personal score when traveling solo). */
  score: number;
  /** Distance from the stop being replaced. */
  km: number;
}

/** Kinds that can stand in for each other when a city is thin on one of them. */
const NEAR_KIND: Record<PlaceKind, PlaceKind[]> = { eat: ["nightlife"], nightlife: ["eat"], do: [], stay: [], move: ["do"] };

/**
 * Alternatives for an itinerary stop from the city's full place list (hand-picked + live):
 * same kind first, not already on the trip, ranked by how well they fit everyone on the trip,
 * with a nudge toward nearby spots. Places of the same style (e.g. another steakhouse) rank first.
 */
export const swapOptions = (trip: Trip, item: ItineraryItem, people: TripPerson[], pool: Place[], limit = 3): SwapOption[] => {
  const used = new Set(trip.days.flatMap((d) => d.items.map((x) => x.place.id)));
  const city = item.place.city || trip.city;
  const inCity = pool.filter((p) => sameCity(p.city, city) && !used.has(p.id) && distanceKm(item.place, p) < 25);
  let candidates = inCity.filter((p) => p.kind === item.place.kind);
  if (candidates.length < limit) candidates = [...candidates, ...inCity.filter((p) => NEAR_KIND[item.place.kind].includes(p.kind))];
  const style = item.place.cuisine?.toLowerCase();
  return candidates
    .map((place) => {
      const km = distanceKm(item.place, place);
      const sameStyle = Boolean(style && place.cuisine?.toLowerCase() === style);
      return { place, score: scoreForPeople(people, place).group, km, rank: 0 };
    })
    .map((o) => ({ ...o, rank: o.score - Math.min(o.km, 6) * 1.5 + (style && o.place.cuisine?.toLowerCase() === style ? 4 : 0) + (o.place.kind === item.place.kind ? 0 : -8) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ place, score, km }) => ({ place, score, km }));
};

export const kmLabel = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
