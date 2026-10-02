import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/types";
import { dayDate, useTrips } from "@/providers/TripsProvider";

interface Props {
  place: Place;
  preferredTripId?: string;
  className?: string;
  size?: "md" | "sm";
}

/** Primary "Add to trip" control with a trip + day picker popover. */
export function AddToTripButton({ place, preferredTripId, className, size = "md" }: Props) {
  const { trips, addToTrip, createTrip } = useTrips();
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>(false);

  const options = useMemo(() => {
    const sameCity = trips.filter((t) => t.city === place.city);
    const preferred = sameCity.find((t) => t.id === preferredTripId);
    return preferred ? [preferred, ...sameCity.filter((t) => t.id !== preferred.id)] : sameCity;
  }, [trips, place.city, preferredTripId]);

  const [tripId, setTripId] = useState<string | undefined>(undefined);
  const trip = options.find((t) => t.id === tripId) ?? options[0];

  const added = trips.some((t) => t.days.some((d) => d.items.some((x) => x.place.id === place.id)));

  const add = (dayIndex: number) => {
    if (!trip) return;
    addToTrip(trip.id, dayIndex, place);
    setOpen(false);
    toast.success(`${place.name} added to Day ${dayIndex + 1}`, {
      description: `${trip.city} itinerary updated`,
      action: { label: "View", onClick: () => navigate(`/trips/${trip.id}?day=${dayIndex + 1}`) },
    });
  };

  const startTrip = () => {
    const today = new Date();
    const start = new Date(today.getTime() + 30 * 86_400_000);
    const end = new Date(start.getTime() + 3 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const t = createTrip(place.city, iso(start), iso(end));
    addToTrip(t.id, 0, place);
    setOpen(false);
    toast.success(`New ${place.city} trip started`, {
      description: `${place.name} is on Day 1`,
      action: { label: "View", onClick: () => navigate(`/trips/${t.id}`) },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "press inline-flex flex-1 items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
            size === "md" ? "h-11 px-4 text-[15px]" : "h-9 px-3 text-sm",
            added ? "border border-primary/40 bg-accent text-primary hover:bg-accent/70" : "bg-primary text-primary-foreground hover:bg-primary/90",
            className,
          )}
        >
          {added ? <Check className="size-4" /> : <Plus className="size-4" />}
          {added ? "In your trip" : "Add to trip"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-xl p-0" align="start">
        {trip ? (
          <div>
            <div className="border-b border-border/70 p-3">
              <p className="eyebrow mb-1.5">Add to</p>
              {options.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTripId(t.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium",
                        t.id === trip.id ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted",
                      )}
                    >
                      {t.city} · {t.startDate.slice(5)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-display text-lg">{trip.city} trip</p>
              )}
            </div>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto p-3 scrollbar-thin">
              {trip.days.map((d, i) => {
                const date = dayDate(trip, i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => add(i)}
                    className="press rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-primary/60 hover:bg-accent"
                  >
                    <span className="block text-sm font-semibold">Day {i + 1}</span>
                    <span className="block text-xs text-muted-foreground">
                      {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {d.items.length} stops
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">You don't have a {place.city} trip yet.</p>
            <button type="button" onClick={startTrip} className="press w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
              Start a {place.city} trip
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
