import { PLACES } from "@/data/places";
import { scoreForPeople, type TripPerson } from "@/hooks/use-trip-people";
import { distanceKm } from "@/lib/geo";
import type { ItineraryItem, Place, Trip } from "@/lib/types";

export interface SwapOption {
  place: Place;
  /** Group score (or the personal score when traveling solo). */
  score: number;
  /** Distance from the stop being replaced. */
  km: number;
}

/**
 * Alternatives for an itinerary stop: same city and kind, not already on the trip,
 * ranked by how well they fit everyone on the trip, with a small nudge toward nearby spots.
 */
export const swapOptions = (trip: Trip, item: ItineraryItem, people: TripPerson[], limit = 3): SwapOption[] => {
  const used = new Set(trip.days.flatMap((d) => d.items.map((x) => x.place.id)));
  const city = item.place.city || trip.city;
  return PLACES.filter((p) => p.city === city && p.kind === item.place.kind && !used.has(p.id))
    .map((place) => ({ place, score: scoreForPeople(people, place).group, km: distanceKm(item.place, place) }))
    .sort((a, b) => b.score - Math.min(a.km, 6) - (a.score - Math.min(b.km, 6)))
    .slice(0, limit);
};

export const kmLabel = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
