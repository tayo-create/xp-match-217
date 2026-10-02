import { ArrowUpRight, Map as MapIcon, Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { BlendDonut, BlendLegend } from "@/components/xp/BlendDonut";
import { TripMap, dayColor, type MapStop } from "@/components/xp/TripMap";
import { CITIES, KIND_LABEL, placeImage } from "@/data/places";
import { useCityPlaces } from "@/hooks/use-city-places";
import { sameCity } from "@/lib/livePlaces";
import { scoreForPeople, useTripPeople } from "@/hooks/use-trip-people";
import { cn } from "@/lib/utils";
import type { ConciergeChat, Place } from "@/lib/types";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { chronological, formatRange, freshItemIds, useTrips } from "@/providers/TripsProvider";

import { ItineraryEditor } from "./ItineraryEditor";
import { PlaceDetail } from "./PlaceDetail";

/** What the panel below the map shows: the trip's itinerary, or one place opened from the chat or map. */
export type PanelView = { kind: "trip" } | { kind: "place"; place: Place; nonce: number };

interface Props {
  chat?: ConciergeChat;
  view: PanelView;
  onView: (v: PanelView) => void;
  dayFilter: "all" | number;
  onDayFilter: (d: "all" | number) => void;
  onAsk: (text: string) => void;
  /** Leaves room for the sheet's close button in the header. */
  closeSpace?: boolean;
}

/**
 * The chat's side panel: a live map on top, with the in-chat itinerary (swap, move, remove)
 * or the place you tapped underneath. Suggested picks that aren't planned yet show as hollow pins.
 */
export function ChatSidePanel({ chat, view, onView, dayFilter, onDayFilter, onAsk, closeSpace }: Props) {
  const { tripById, me, addToTrip } = useTrips();
  const { markSeen } = useConcierge();
  const people = useTripPeople(chat);
  const trip = tripById(chat?.tripId);
  // Warms the city's places (so Swap is instant) and fixes up new-city trips with their real map spot.
  useCityPlaces(trip?.city, trip);

  const fresh = useMemo(() => freshItemIds(trip, chat?.seenAt, me.id), [trip, chat?.seenAt, me.id]);
  const stops = useMemo<MapStop[]>(() => (trip ? chronological(trip).map(({ item, day }) => ({ id: item.id, place: item.place, time: item.time, day })) : []), [trip]);
  const numbers = useMemo(() => Object.fromEntries(stops.map((s, i) => [s.id, i + 1])) as Record<string, number>, [stops]);
  const planned = useMemo(() => new Set(stops.map((s) => s.place.id)), [stops]);

  // Every pick XP showed in this chat that isn't on the itinerary yet, newest first.
  const suggested = useMemo(() => {
    const seen = new Set<string>();
    const out: Place[] = [];
    [...(chat?.messages ?? [])].reverse().forEach((m) =>
      m.picks?.forEach((p) => {
        if (seen.has(p.id) || planned.has(p.id) || (trip && !sameCity(p.city, trip.city))) return;
        seen.add(p.id);
        out.push(p);
      }),
    );
    return out;
  }, [chat?.messages, planned, trip]);

  const focused = view.kind === "place" ? view.place : undefined;
  const focusedStop = useMemo(() => {
    if (!trip || !focused) return undefined;
    for (let day = 0; day < trip.days.length; day++) {
      const item = trip.days[day].items.find((x) => x.place.id === focused.id);
      if (item) return { item, day };
    }
    return undefined;
  }, [trip, focused]);

  const extras = useMemo(() => {
    if (focused && !focusedStop && !suggested.some((p) => p.id === focused.id)) return [focused, ...suggested];
    return suggested;
  }, [focused, focusedStop, suggested]);

  const mapStops = useMemo(() => (dayFilter === "all" ? stops : stops.filter((s) => s.day === dayFilter)), [stops, dayFilter]);
  const center = useMemo<[number, number]>(() => {
    if (trip) return trip.center;
    const first = focused ?? suggested[0];
    const city = CITIES.find((c) => sameCity(c.name, first?.city ?? ""));
    return city?.center ?? (first ? [first.lat, first.lng] : CITIES[0].center);
  }, [trip, focused, suggested]);

  const activeId = focused ? (focusedStop ? focusedStop.item.id : `pick:${focused.id}`) : undefined;

  // A stop on another day than the filter? Widen the map so its pin is visible.
  useEffect(() => {
    if (focusedStop && dayFilter !== "all" && dayFilter !== focusedStop.day) onDayFilter(focusedStop.day);
  }, [focusedStop, dayFilter, onDayFilter]);

  const open = (place: Place) => onView({ kind: "place", place, nonce: Date.now() });

  const onSelect = (id: string) => {
    if (id.startsWith("pick:")) {
      const p = extras.find((x) => `pick:${x.id}` === id);
      if (p) open(p);
      return;
    }
    const s = stops.find((x) => x.id === id);
    if (s) open(s.place);
  };

  const hasMap = Boolean(trip) || extras.length > 0;
  const stopCount = stops.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center gap-3 border-b border-border/70 py-3.5 pl-5", closeSpace ? "pr-12" : "pr-5")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <MapIcon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[20px] font-semibold leading-tight text-secondary">{trip ? `${trip.city} itinerary` : "Trip map"}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {trip ? `${formatRange(trip.startDate, trip.endDate)} · ${stopCount} ${stopCount === 1 ? "stop" : "stops"}` : extras.length ? `${extras.length} picks from this chat` : "Picks and plans appear here"}
          </p>
        </div>
        {trip ? (
          <Link to={`/trips/${trip.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-accent">
            Full page <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </div>

      {hasMap ? (
        <div className="relative h-[36vh] min-h-[220px] max-h-[380px] shrink-0 border-b border-border/70">
          <TripMap
            stops={mapStops}
            center={center}
            activeId={activeId}
            onSelect={onSelect}
            freshIds={fresh}
            multiDay={dayFilter === "all"}
            labels={false}
            compact
            extras={extras}
            numbers={numbers}
            focus={focused ? [focused.lat, focused.lng] : undefined}
            focusKey={view.kind === "place" ? `${view.place.id}-${view.nonce}` : undefined}
          />
          <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-1.5">
            {stopCount ? (
              <span className="rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-secondary shadow-sm">
                {dayFilter === "all" ? "All days" : `Day ${dayFilter + 1}`} · {mapStops.length} planned
              </span>
            ) : null}
            {extras.length ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground/75 shadow-sm">
                <span className="grid size-3 place-items-center rounded-full border-2 border-secondary bg-white">
                  <span className="size-1 rounded-full bg-primary" />
                </span>
                {extras.length} suggested
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4 scrollbar-thin">
        {focused ? (
          <PlaceDetail
            place={focused}
            trip={trip}
            stop={focusedStop}
            people={people}
            backLabel={trip ? "Back to itinerary" : "Back"}
            onBack={() => onView({ kind: "trip" })}
            onAsk={onAsk}
            onSwapped={open}
          />
        ) : trip ? (
          <>
            {fresh.size ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-accent/70 px-3.5 py-2.5 animate-rise" role="status">
                <span className="size-2.5 shrink-0 rounded-full bg-primary fresh-dot" />
                <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
                  <span className="font-semibold text-secondary">
                    {fresh.size} new {fresh.size === 1 ? "stop" : "stops"}
                  </span>{" "}
                  <span className="text-foreground/70">highlighted below</span>
                </p>
                <button type="button" onClick={() => chat && markSeen(chat.id)} className="rounded-md px-1.5 py-1 text-[13px] font-semibold text-primary hover:bg-background/60">
                  Got it
                </button>
              </div>
            ) : null}

            <ItineraryEditor trip={trip} people={people} fresh={fresh} numbers={numbers} dayFilter={dayFilter} onDayFilter={onDayFilter} onOpenPlace={open} onAsk={onAsk} />

            {suggested.length ? (
              <section className="mt-7 border-t border-border pt-5" aria-label="Suggested, not planned yet">
                <p className="eyebrow">From this chat · not planned yet</p>
                <ul className="mt-2.5 space-y-1.5">
                  {suggested.map((p) => (
                    <SuggestedRow key={p.id} place={p} score={scoreForPeople(people, p).group} onOpen={() => open(p)} onAdd={(day) => addToTrip(trip.id, day, p)} days={trip.days.length} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : extras.length ? (
          <section aria-label="Picks from this chat">
            <p className="eyebrow">Picks from this chat</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Mention dates and I'll turn these into a day-by-day itinerary.</p>
            <ul className="mt-3 space-y-1.5">
              {extras.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => open(p)} className="press flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-card p-2 text-left hover:border-secondary/30">
                    <img src={placeImage(p)} alt="" loading="lazy" className="size-11 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {p.cuisine ?? KIND_LABEL[p.kind]} · {p.neighborhood}
                      </span>
                    </span>
                    <span className="match-pill">{scoreForPeople(people, p).group}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyPanel chat={chat} />
        )}
      </div>
    </div>
  );
}

function SuggestedRow({ place, score, days, onOpen, onAdd }: { place: Place; score: number; days: number; onOpen: () => void; onAdd: (day: number) => void }) {
  const [picking, setPicking] = useState<boolean>(false);
  return (
    <li className="rounded-xl border border-dashed border-secondary/25 bg-card/60 p-2">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={`Show ${place.name} on the map`}>
          <img src={placeImage(place)} alt="" loading="lazy" className="size-10 rounded-lg object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">{place.name}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              <span className="font-semibold text-primary">{score}%</span> · {place.cuisine ?? KIND_LABEL[place.kind]}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          className={cn("press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-semibold", picking ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground")}
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {picking ? (
        <div className="mt-2 flex flex-wrap gap-1.5 animate-rise">
          {Array.from({ length: days }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onAdd(i);
                setPicking(false);
              }}
              className="press inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12px] font-semibold hover:border-primary/50"
            >
              <span className="size-2 rounded-full" style={{ background: dayColor(i) }} /> Day {i + 1}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function EmptyPanel({ chat }: { chat?: ConciergeChat }) {
  const { profile } = useProfile();
  const { trips } = useTrips();
  const { linkTrip } = useConcierge();
  return (
    <div>
      <p className="eyebrow">Live itinerary</p>
      <h2 className="mt-2 text-[28px] font-semibold leading-tight text-secondary">Your trip builds itself</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">Mention a city and dates and I'll start the itinerary. Every pick shows up on this map, and you can tap any place to see it here.</p>
      <ol className="mt-5 space-y-3">
        {["Say where and when", "Tap a pick to see it on the map", "Swap anything you don't love"].map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-[15px]">
            <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {chat && trips.length ? (
        <div className="mt-7 border-t border-border pt-5">
          <p className="text-sm font-medium">Or connect an existing trip</p>
          <div className="mt-3 space-y-2">
            {trips.slice(0, 4).map((t) => (
              <button key={t.id} type="button" onClick={() => linkTrip(chat.id, t.id)} className="press flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left hover:bg-muted">
                <img src={t.cover} alt="" className="size-11 rounded-lg object-cover" />
                <span>
                  <span className="block font-medium">{t.city}</span>
                  <span className="block text-xs text-muted-foreground">{formatRange(t.startDate, t.endDate)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-8 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-[17px] font-semibold">Planning for your blend</h2>
          <Link to="/travelers" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Sparkles className="size-3.5" /> Profile
          </Link>
        </div>
        <div className="mt-4 flex items-center gap-5">
          <BlendDonut blend={profile.blend} size={112} thickness={18} />
          <BlendLegend blend={profile.blend} />
        </div>
      </div>
    </div>
  );
}
