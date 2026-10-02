import { Bookmark, Star } from "lucide-react";
import { memo, useMemo } from "react";
import { Link } from "react-router-dom";

import { AddToTripButton } from "@/components/xp/AddToTrip";
import { MatchPill } from "@/components/xp/MatchPill";
import { TwinBars, WhyBadge } from "@/components/xp/ScoreBreakdown";
import { scoreForPeople, type TripPerson } from "@/hooks/use-trip-people";
import { Stars } from "@/components/xp/Stars";
import { placeImage, priceLabel } from "@/data/places";
import { matchPlace } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/types";
import { useList } from "@/providers/ListProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useReviews } from "@/providers/ReviewsProvider";
import { useTrips } from "@/providers/TripsProvider";

interface Props {
  place: Place;
  tripId?: string;
  index?: number;
  className?: string;
  /** When there are 2+ people, shows the group score with each person's bar. */
  people?: TripPerson[];
}

/** Editorial pick card with photo, match badge, meta, and trip actions. */
export const PlaceCard = memo(function PlaceCard({ place, tripId, index = 0, className, people }: Props) {
  const { profile } = useProfile();
  const { isSaved, toggleSaved } = useTrips();
  const { stats } = useReviews();
  const match = useMemo(() => matchPlace(profile, place), [profile, place]);
  const group = useMemo(() => (people && people.length > 1 ? scoreForPeople(people, place) : undefined), [people, place]);
  const { openRate, logFor } = useList();
  const s = stats(place.id);
  const saved = isSaved(place.id);
  const mine = logFor(place.id);

  return (
    <article
      className={cn("surface group flex flex-col overflow-hidden transition-shadow hover:shadow-[0_18px_40px_-20px_hsl(222_37%_19%/0.35)] animate-rise", className)}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <img
          src={placeImage(place)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        {group ? (
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <WhyBadge scores={group} />
            <span className="match-pill px-3 py-1.5 text-[13px]">{group.group}% group</span>
          </div>
        ) : (
          <div className="absolute right-3 top-3">
            <MatchPill match={match} className="px-3 py-1.5 text-[13px]" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-sans text-[17px] font-semibold leading-snug tracking-tight">{place.name}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {[place.cuisine ?? place.kind.charAt(0).toUpperCase() + place.kind.slice(1), place.neighborhood, priceLabel(place.price)].join(" · ")}
        </p>
        {s.count > 0 ? (
          <Link to={`/reviews?place=${place.id}`} className="mt-1.5 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Stars value={s.avg} size={12} /> {s.avg.toFixed(1)} · {s.count} reviews
          </Link>
        ) : null}
        {group ? <TwinBars scores={group} compact className="mt-3" /> : null}
        <p className={cn("mt-2 flex-1 text-[13.5px] leading-relaxed text-foreground/80", group ? "line-clamp-2" : "line-clamp-3")}>{place.blurb}</p>
        <div className="mt-4 flex items-center gap-2">
          <AddToTripButton place={place} preferredTripId={tripId} size="sm" />
          <button
            type="button"
            onClick={() => toggleSaved(place.id)}
            aria-pressed={saved}
            aria-label={saved ? `Unsave ${place.name}` : `Save ${place.name}`}
            className={cn(
              "press grid size-9 shrink-0 place-items-center rounded-lg border transition-colors",
              saved ? "border-primary/40 bg-accent text-primary" : "border-border text-foreground/70 hover:bg-muted",
            )}
          >
            <Bookmark className={cn("size-4", saved && "fill-primary")} />
          </button>
          <button
            type="button"
            onClick={() => openRate(place)}
            aria-label={mine ? `Your rating ${mine.score.toFixed(1)}, edit` : `Rate ${place.name}`}
            title={mine ? "Your rating" : "Been here? Rate it"}
            className={cn(
              "press grid h-9 min-w-9 shrink-0 place-items-center rounded-lg border px-2 text-[13px] font-bold tabular-nums transition-colors",
              mine ? "border-secondary bg-secondary text-secondary-foreground" : "border-border text-foreground/70 hover:bg-muted",
            )}
          >
            {mine ? mine.score.toFixed(1) : <Star className="size-4" />}
          </button>
        </div>
      </div>
    </article>
  );
});
