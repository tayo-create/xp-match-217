import { ArrowLeft, ArrowLeftRight, Bookmark, CalendarDays, ExternalLink, Navigation, Sparkles, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { AddToTripButton } from "@/components/xp/AddToTrip";
import { TwinBars } from "@/components/xp/ScoreBreakdown";
import { Stars } from "@/components/xp/Stars";
import { dayColor } from "@/components/xp/TripMap";
import { KIND_LABEL, placeImage, priceLabel } from "@/data/places";
import { TRAVELER_TYPES } from "@/data/travelerTypes";
import { scoreForPeople, type TripPerson } from "@/hooks/use-trip-people";
import { bookingLinkFor } from "@/lib/booking";
import { cn } from "@/lib/utils";
import type { ItineraryItem, Place, Trip } from "@/lib/types";
import { useList } from "@/providers/ListProvider";
import { useReviews } from "@/providers/ReviewsProvider";
import { dayDate, useTrips } from "@/providers/TripsProvider";

import { SwapList } from "./SwapList";

interface Props {
  place: Place;
  trip?: Trip;
  /** The itinerary stop this place sits on, if it's planned. */
  stop?: { item: ItineraryItem; day: number };
  people: TripPerson[];
  backLabel: string;
  onBack: () => void;
  onAsk: (text: string) => void;
  /** Called after the stop is swapped so the panel can follow the new place. */
  onSwapped?: (place: Place) => void;
}

/** A place opened from the chat or the map: why it fits, where it sits on the trip, and actions. */
export function PlaceDetail({ place, trip, stop, people, backLabel, onBack, onAsk, onSwapped }: Props) {
  const { removeItem, addToTrip, isSaved, toggleSaved } = useTrips();
  const { stats } = useReviews();
  const { openRate, logFor } = useList();
  const [swapping, setSwapping] = useState<boolean>(false);
  const scores = useMemo(() => scoreForPeople(people, place), [people, place]);
  const solo = scores.per.length === 1 ? scores.per[0].score : undefined;
  const s = stats(place.id);
  const saved = isSaved(place.id);
  const mine = logFor(place.id);
  const booking = bookingLinkFor(place);

  const remove = () => {
    if (!trip || !stop) return;
    const { item, day } = stop;
    removeItem(trip.id, day, item.id);
    toast(`Removed ${item.place.name} from Day ${day + 1}`, {
      action: { label: "Undo", onClick: () => addToTrip(trip.id, day, item.place, item.time, item.note) },
    });
  };

  return (
    <div className="pt-1 animate-rise" key={place.id}>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[13px] font-semibold text-foreground/70 hover:text-foreground">
        <ArrowLeft className="size-4" /> {backLabel}
      </button>

      <div className="relative mt-2 aspect-[16/9] overflow-hidden rounded-xl bg-muted">
        <img src={placeImage(place)} alt="" className="h-full w-full object-cover" />
        <span className="match-pill absolute right-3 top-3 px-3 py-1.5 text-[13px]">
          {scores.group}% {scores.per.length > 1 ? "group" : "match"}
        </span>
      </div>

      <h3 className="mt-3 font-display text-[26px] font-semibold leading-tight text-secondary">{place.name}</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {[place.cuisine ?? KIND_LABEL[place.kind], place.neighborhood, priceLabel(place.price)].filter(Boolean).join(" · ")}
      </p>
      {s.count > 0 ? (
        <Link to={`/reviews?place=${place.id}`} className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Stars value={s.avg} size={12} /> {s.avg.toFixed(1)} · {s.count} reviews
        </Link>
      ) : null}

      {trip && stop ? (
        <div className="mt-4 rounded-xl border border-primary/30 bg-accent/60 p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full text-white" style={{ background: dayColor(stop.day) }}>
              <CalendarDays className="size-4" />
            </span>
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
              <span className="font-semibold text-secondary">
                On Day {stop.day + 1} · {stop.item.time}
              </span>
              <span className="block text-[12px] text-foreground/65">
                {dayDate(trip, stop.day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                {stop.item.addedBy ? ` · added by ${stop.item.addedBy}` : ""}
              </span>
            </p>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setSwapping((v) => !v)}
              aria-expanded={swapping}
              className={cn("press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold", swapping ? "bg-secondary text-secondary-foreground" : "border border-secondary/30 bg-card text-secondary hover:bg-muted")}
            >
              <ArrowLeftRight className="size-4" /> Swap
            </button>
            <button type="button" onClick={remove} className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground/70 hover:text-destructive">
              <Trash2 className="size-4" /> Remove
            </button>
          </div>
          {swapping ? (
            <div className="mt-2.5">
              <SwapList
                trip={trip}
                item={stop.item}
                day={stop.day}
                people={people}
                onAsk={onAsk}
                onSwapped={(p) => {
                  setSwapping(false);
                  onSwapped?.(p);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <AddToTripButton place={place} preferredTripId={trip?.id} />
        </div>
      )}

      <div className="mt-4">
        {solo ? (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="size-3.5" /> Why it's {solo.score}%
            </p>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-snug text-foreground/85">
              {solo.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: TRAVELER_TYPES[solo.dominantType].color }} />
                  {r}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Fit for everyone</p>
            <TwinBars scores={scores} />
          </>
        )}
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-foreground/80">{place.blurb}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={booking.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-secondary text-[13px] font-semibold text-secondary-foreground hover:bg-secondary/90">
          {booking.label} <ExternalLink className="size-3.5" />
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-semibold hover:bg-muted"
        >
          <Navigation className="size-3.5" /> Directions
        </a>
        <button
          type="button"
          onClick={() => toggleSaved(place.id)}
          aria-pressed={saved}
          className={cn("press inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold", saved ? "border-primary/40 bg-accent text-primary" : "border-border bg-card hover:bg-muted")}
        >
          <Bookmark className={cn("size-3.5", saved && "fill-primary")} /> {saved ? "Saved" : "Save"}
        </button>
        <button type="button" onClick={() => openRate(place)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-semibold hover:bg-muted">
          <Star className="size-3.5" /> {mine ? `Rated ${mine.score.toFixed(1)}` : "Rate it"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onAsk(`More places like ${place.name}`)}
        className="press mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 text-[13px] font-semibold text-primary hover:bg-accent/60"
      >
        <Sparkles className="size-3.5" /> Ask XP for more like this
      </button>
    </div>
  );
}
