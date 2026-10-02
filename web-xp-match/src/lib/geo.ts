import type { Place } from "@/lib/types";

/** Great-circle distance in kilometers. */
export const distanceKm = (a: Pick<Place, "lat" | "lng">, b: Pick<Place, "lat" | "lng">): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export interface Leg {
  km: number;
  minutes: number;
  mode: "walk" | "ride";
  label: string;
}

/** "850 m" under a kilometer, "2.4 km" above. */
export const formatKm = (km: number): string => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`);

/** Long label for a hop, e.g. "850 m · 11 min walk". */
export const legLabel = (km: number, minutes: number, mode: Leg["mode"]): string =>
  mode === "walk" ? `${formatKm(km)} · ${minutes} min walk` : `${formatKm(km)} · ~${minutes} min by tram or taxi`;

/** Short label for map chips and compact lists, e.g. "11 min walk · 850 m". */
export const legShort = (leg: Pick<Leg, "km" | "minutes" | "mode">): string => `${leg.minutes} min ${leg.mode === "walk" ? "walk" : "ride"} · ${formatKm(leg.km)}`;

/** Estimated ride time over a street distance: average city speed plus a few minutes of waiting. */
export const rideMinutes = (km: number): number => Math.max(6, Math.round((km / 22) * 60) + 4);

/** Estimates the hop between two stops: walking under ~2.5 km, otherwise a short ride. */
export const legBetween = (a: Pick<Place, "lat" | "lng">, b: Pick<Place, "lat" | "lng">): Leg => {
  const km = distanceKm(a, b) * 1.25;
  if (km <= 2.5) {
    const minutes = Math.max(2, Math.round((km / 4.8) * 60));
    return { km, minutes, mode: "walk", label: legLabel(km, minutes, "walk") };
  }
  const minutes = rideMinutes(km);
  return { km, minutes, mode: "ride", label: legLabel(km, minutes, "ride") };
};
