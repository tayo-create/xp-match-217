import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { CITIES } from "@/data/places";
import { type CityInfo, cityPlacesQuery, curatedFor, sameCity } from "@/lib/livePlaces";
import type { Place, Trip } from "@/lib/types";
import { useTrips } from "@/providers/TripsProvider";

export interface CityPlacesState {
  places: Place[];
  info?: CityInfo;
  /** True while a city's places load for the first time (hand-picked ones are available meanwhile). */
  isLoading: boolean;
  /** How many places came from live OpenStreetMap data. */
  liveCount: number;
  error: Error | null;
  retry: () => void;
}

/**
 * Every recommendable place in a city (hand-picked plus live). Passing the trip also fixes up trips
 * created for a new city with its real map position, cover photo and country once they're known.
 */
export function useCityPlaces(city: string | undefined, trip?: Trip): CityPlacesState {
  const enabled = Boolean(city?.trim());
  const query = useQuery({ ...cityPlacesQuery(city ?? ""), enabled });
  const { patchTrip } = useTrips();
  const data = query.data;

  useEffect(() => {
    if (!trip || !data || trip.located || CITIES.some((c) => sameCity(c.name, trip.city))) return;
    if (!sameCity(trip.city, data.city.name)) return;
    patchTrip(trip.id, { located: true, center: data.city.center, cover: data.city.cover, country: data.city.country, blurb: data.city.blurb ?? trip.blurb });
  }, [trip, data, patchTrip]);

  return {
    places: data?.places ?? curatedFor(city),
    info: data?.city,
    isLoading: enabled && query.isPending,
    liveCount: data?.liveCount ?? 0,
    error: query.error,
    retry: () => void query.refetch(),
  };
}
