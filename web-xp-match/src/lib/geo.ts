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

/** Estimates the hop between two stops: walking under ~2.5 km, otherwise a short ride. */
export const legBetween = (a: Place, b: Place): Leg => {
  const km = distanceKm(a, b) * 1.25;
  if (km <= 2.5) {
    const minutes = Math.max(2, Math.round((km / 4.8) * 60));
    return { km, minutes, mode: "walk", label: `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} · ${minutes} min walk` };
  }
  const minutes = Math.max(6, Math.round((km / 22) * 60) + 4);
  return { km, minutes, mode: "ride", label: `${km.toFixed(1)} km · ~${minutes} min by tram or taxi` };
};
