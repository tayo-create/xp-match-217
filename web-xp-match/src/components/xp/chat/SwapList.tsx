import { ArrowLeftRight, Loader2, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { KIND_LABEL, placeImage, priceLabel } from "@/data/places";
import { useCityPlaces } from "@/hooks/use-city-places";
import { scoreForPeople, type TripPerson } from "@/hooks/use-trip-people";
import { cn } from "@/lib/utils";
import type { ItineraryItem, Place, Trip } from "@/lib/types";
import { useTrips } from "@/providers/TripsProvider";

import { kmLabel, swapOptions } from "./swap";

interface Props {
  trip: Trip;
  item: ItineraryItem;
  day: number;
  people: TripPerson[];
  onSwapped?: (place: Place) => void;
  onAsk?: (text: string) => void;
}

/** Inline list of ranked alternatives for one stop. Swapping keeps the day and time slot, with Undo. */
export function SwapList({ trip, item, day, people, onSwapped, onAsk }: Props) {
  const { replaceItem } = useTrips();
  const [more, setMore] = useState<boolean>(false);
  const { places, isLoading, error, retry } = useCityPlaces(trip.city, trip);
  const options = useMemo(() => swapOptions(trip, item, people, places, 12), [trip, item, people, places]);
  const current = useMemo(() => scoreForPeople(people, item.place).group, [people, item.place]);
  const shown = more ? options : options.slice(0, 4);
  const kind = KIND_LABEL[item.place.kind].toLowerCase();

  const swap = (place: Place) => {
    const old = item.place;
    replaceItem(trip.id, day, item.id, place);
    onSwapped?.(place);
    toast.success(`Swapped in ${place.name}`, {
      description: `Day ${day + 1} · ${item.time} · replaced ${old.name}`,
      action: { label: "Undo", onClick: () => replaceItem(trip.id, day, item.id, old) },
    });
  };

  return (
    <div className="rounded-xl border border-secondary/15 bg-secondary/[0.04] p-2.5 animate-rise">
      <p className="px-1 pb-2 text-[12px] font-semibold text-foreground/70">
        Swap for another {kind} spot <span className="font-normal text-muted-foreground">· current fit {current}%</span>
      </p>
      {shown.length === 0 && isLoading ? (
        <p className="flex items-center gap-2 px-1 pb-1 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Finding {kind} spots around {trip.city}…
        </p>
      ) : shown.length === 0 ? (
        <div className="px-1 pb-1 text-[13px] text-muted-foreground">
          {error ? "Couldn't reach live places right now." : `No other ${kind} spots nearby.`}
          {error ? (
            <button type="button" onClick={retry} className="ml-1 font-semibold text-primary hover:underline">
              Try again
            </button>
          ) : null}
          {onAsk ? (
            <button type="button" onClick={() => onAsk(`Find me a different ${kind} option instead of ${item.place.name} on day ${day + 1}`)} className="ml-1 font-semibold text-primary hover:underline">
              Ask XP
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((o) => {
            const diff = o.score - current;
            return (
              <li key={o.place.id} className="flex items-center gap-2.5 rounded-lg bg-card p-1.5 pr-2 shadow-[0_1px_0_hsl(39_28%_80%/0.6)]">
                <img src={placeImage(o.place)} alt="" loading="lazy" className="size-11 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold leading-tight">{o.place.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <span className="font-semibold text-primary">{o.score}%</span>
                    <span className={cn("tabular-nums", diff > 0 ? "text-[#3F8A63]" : "text-muted-foreground")}>{diff > 0 ? `+${diff}` : diff}</span>
                    <span>·</span>
                    <MapPin className="size-3" /> {kmLabel(o.km)}
                    <span>·</span>
                    {priceLabel(o.place.price)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => swap(o.place)}
                  aria-label={`Swap ${item.place.name} for ${o.place.name}`}
                  className="press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-secondary px-2.5 text-[12.5px] font-semibold text-secondary-foreground hover:bg-secondary/90"
                >
                  <ArrowLeftRight className="size-3.5" /> Use
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {options.length > 4 ? (
        <button type="button" onClick={() => setMore((v) => !v)} className="mt-1.5 w-full rounded-md py-1 text-[12px] font-semibold text-secondary/80 hover:bg-card">
          {more ? "Fewer options" : `${options.length - 4} more options`}
        </button>
      ) : null}
    </div>
  );
}
