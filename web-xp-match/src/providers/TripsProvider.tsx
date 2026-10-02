import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo } from "react";

import { CITIES } from "@/data/places";
import { getClientId } from "@/lib/backend";
import { IMG } from "@/lib/images";
import { uid, usePersistentState } from "@/lib/persist";
import type { Place, Trip } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";

/** Who placed a stop: the concierge ("xp") or a person's device id plus display name. */
export interface AddedBy {
  id: string;
  label: string;
}

export const XP_AUTHOR: AddedBy = { id: "xp", label: "XP" };

/** Ids of stops someone else (XP or a collaborator) added after `seenAt`. */
export const freshItemIds = (trip: Trip | undefined, seenAt: number | undefined, meId: string): Set<string> => {
  const out = new Set<string>();
  if (!trip) return out;
  const since = seenAt ?? 0;
  trip.days.forEach((d) =>
    d.items.forEach((x) => {
      if (x.addedAt && x.addedAt > since && x.addedById !== meId) out.add(x.id);
    }),
  );
  return out;
};

/** All stops of a trip in chronological order (day, then time). */
export const chronological = (trip: Trip) =>
  trip.days.flatMap((d, day) => d.items.map((item) => ({ item, day })));

const DEFAULT_TIMES = ["09:00", "12:30", "16:00", "20:00", "22:00"];

const sortItems = (a: { time: string }, b: { time: string }): number => a.time.localeCompare(b.time);

export const dayCount = (start: string, end: string): number => {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
};

export const dayDate = (trip: Trip, dayIndex: number): Date => {
  const d = new Date(`${trip.startDate}T00:00:00`);
  d.setDate(d.getDate() + dayIndex);
  return d;
};

export const formatRange = (start: string, end: string): string => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth();
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return sameMonth
    ? `${m(s)} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
    : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}, ${e.getFullYear()}`;
};

export const [TripsProvider, useTrips] = createContextHook(() => {
  const { profile } = useProfile();
  const [trips, setTrips] = usePersistentState<Trip[]>("xp.trips.v1", []);
  const { user } = useAuth();
  // Signed-in people are identified by their account so collaborators see one person across devices.
  const me = useMemo<AddedBy>(() => ({ id: user?.id ?? getClientId(), label: profile.name }), [profile.name, user?.id]);
  const [savedIds, setSavedIds] = usePersistentState<string[]>("xp.saved.v1", []);

  const tripById = useCallback((id: string | undefined) => trips.find((t) => t.id === id), [trips]);

  const tripForCity = useCallback(
    (city: string) => trips.find((t) => t.city.toLowerCase() === city.toLowerCase()),
    [trips],
  );

  /** Creates a trip. New cities get a neutral cover until `meta` (or the places lookup) fills in the real one. */
  const createTrip = useCallback(
    (city: string, startDate: string, endDate: string, meta?: Partial<Pick<Trip, "country" | "center" | "cover" | "blurb" | "located">>): Trip => {
      const known = CITIES.find((c) => c.name.toLowerCase() === city.trim().toLowerCase());
      const n = dayCount(startDate, endDate);
      const name = known?.name ?? city.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase());
      const trip: Trip = {
        id: uid("trip"),
        city: name,
        country: known?.country ?? "",
        startDate,
        endDate,
        cover: known?.cover ?? IMG.genCity,
        blurb: known?.blurb ?? `Your ${name} trip, matched to your taste. Ask the concierge to fill it in.`,
        center: known?.center ?? CITIES[0].center,
        days: Array.from({ length: n }, () => ({ items: [] })),
        ...(known ? {} : meta),
      };
      setTrips((prev) => [trip, ...prev]);
      return trip;
    },
    [setTrips],
  );

  const deleteTrip = useCallback((id: string) => setTrips((prev) => prev.filter((t) => t.id !== id)), [setTrips]);

  /** Updates a trip's details (not its days). */
  const patchTrip = useCallback(
    (id: string, patch: Partial<Omit<Trip, "id" | "days">>) => setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [setTrips],
  );

  /** Inserts or replaces a whole trip (used by live collaboration and "copy to my trips"). */
  const upsertTrip = useCallback(
    (trip: Trip) =>
      setTrips((prev) => {
        const i = prev.findIndex((t) => t.id === trip.id);
        if (i < 0) return [trip, ...prev];
        if (JSON.stringify(prev[i]) === JSON.stringify(trip)) return prev;
        const next = [...prev];
        next[i] = trip;
        return next;
      }),
    [setTrips],
  );

  /** Adds a place to a day; picks the next free default time slot when none is given. */
  const addToTrip = useCallback(
    (tripId: string, dayIndex: number, place: Place, time?: string, note?: string) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          const days = t.days.map((d, i) => {
            if (i !== dayIndex) return d;
            const used = new Set(d.items.map((x) => x.time));
            const slot = time ?? DEFAULT_TIMES.find((x) => !used.has(x)) ?? "18:00";
            const filtered = d.items.filter((x) => x.place.id !== place.id);
            return { items: [...filtered, { id: uid("it"), time: slot, place, note, addedAt: Date.now(), addedBy: me.label, addedById: me.id }].sort(sortItems) };
          });
          return { ...t, days };
        }),
      );
    },
    [setTrips, me],
  );

  const removeItem = useCallback(
    (tripId: string, dayIndex: number, itemId: string) => {
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId
            ? t
            : {
                ...t,
                days: t.days.map((d, i) => (i === dayIndex ? { items: d.items.filter((x) => x.id !== itemId) } : d)),
              },
        ),
      );
    },
    [setTrips],
  );

  /** Swaps the place on an existing stop, keeping its day and time slot. */
  const replaceItem = useCallback(
    (tripId: string, dayIndex: number, itemId: string, place: Place) => {
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId
            ? t
            : {
                ...t,
                days: t.days.map((d, i) =>
                  i === dayIndex
                    ? { items: d.items.map((x) => (x.id === itemId ? { ...x, place, note: undefined, addedAt: Date.now(), addedBy: me.label, addedById: me.id } : x)) }
                    : d,
                ),
              },
        ),
      );
    },
    [setTrips, me],
  );

  const updateItemTime = useCallback(
    (tripId: string, dayIndex: number, itemId: string, time: string) => {
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId
            ? t
            : {
                ...t,
                days: t.days.map((d, i) =>
                  i === dayIndex ? { items: d.items.map((x) => (x.id === itemId ? { ...x, time } : x)).sort(sortItems) } : d,
                ),
              },
        ),
      );
    },
    [setTrips],
  );

  const moveItem = useCallback(
    (tripId: string, fromDay: number, itemId: string, toDay: number) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          const it = t.days[fromDay]?.items.find((x) => x.id === itemId);
          if (!it) return t;
          return {
            ...t,
            days: t.days.map((d, i) => {
              if (i === fromDay) return { items: d.items.filter((x) => x.id !== itemId) };
              if (i === toDay) return { items: [...d.items, it].sort(sortItems) };
              return d;
            }),
          };
        }),
      );
    },
    [setTrips],
  );

  /** Places several stops at once (used by the concierge's auto-planner). */
  const placeMany = useCallback(
    (tripId: string, entries: { place: Place; day: number; time: string }[], by: AddedBy = XP_AUTHOR) => {
      if (!entries.length) return;
      const at = Date.now();
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          const days = t.days.map((d, i) => {
            const mine = entries.filter((e) => e.day === i);
            if (!mine.length) return d;
            const ids = new Set(mine.map((e) => e.place.id));
            const kept = d.items.filter((x) => !ids.has(x.place.id));
            return {
              items: [...kept, ...mine.map((e) => ({ id: uid("it"), time: e.time, place: e.place, addedAt: at, addedBy: by.label, addedById: by.id }))].sort(sortItems),
            };
          });
          return { ...t, days };
        }),
      );
    },
    [setTrips],
  );

  const removePlaces = useCallback(
    (tripId: string, entries: { placeId: string; day: number }[]) => {
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId
            ? t
            : {
                ...t,
                days: t.days.map((d, i) => ({ items: d.items.filter((x) => !entries.some((e) => e.day === i && e.placeId === x.place.id)) })),
              },
        ),
      );
    },
    [setTrips],
  );

  const isInTrip = useCallback(
    (placeId: string) => trips.some((t) => t.days.some((d) => d.items.some((x) => x.place.id === placeId))),
    [trips],
  );

  const toggleSaved = useCallback(
    (placeId: string) =>
      setSavedIds((prev) => (prev.includes(placeId) ? prev.filter((x) => x !== placeId) : [...prev, placeId])),
    [setSavedIds],
  );

  const isSaved = useCallback((placeId: string) => savedIds.includes(placeId), [savedIds]);

  const myPlaceIds = useMemo(() => {
    const s = new Set<string>(savedIds);
    trips.forEach((t) => t.days.forEach((d) => d.items.forEach((x) => s.add(x.place.id))));
    return s;
  }, [trips, savedIds]);

  return {
    trips,
    tripById,
    tripForCity,
    createTrip,
    deleteTrip,
    upsertTrip,
    patchTrip,
    me,
    addToTrip,
    removeItem,
    replaceItem,
    updateItemTime,
    moveItem,
    placeMany,
    removePlaces,
    isInTrip,
    savedIds,
    toggleSaved,
    isSaved,
    myPlaceIds,
  };
});
