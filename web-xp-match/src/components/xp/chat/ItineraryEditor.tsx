import { ArrowLeftRight, CalendarClock, ChevronRight, Footprints, MoreHorizontal, Sparkles, TramFront, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dayColor } from "@/components/xp/TripMap";
import { KIND_LABEL, placeImage } from "@/data/places";
import type { TripPerson } from "@/hooks/use-trip-people";
import { legBetween } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { Place, Trip } from "@/lib/types";
import { dayDate, useTrips } from "@/providers/TripsProvider";

import { SwapList } from "./SwapList";

interface Props {
  trip: Trip;
  people: TripPerson[];
  fresh: Set<string>;
  numbers: Record<string, number>;
  /** "all" or a 0-based day index; shared with the map above. */
  dayFilter: "all" | number;
  onDayFilter: (d: "all" | number) => void;
  onOpenPlace: (place: Place) => void;
  onAsk: (text: string) => void;
}

/** The trip's itinerary inside the chat: tap a stop to see it on the map, swap it, move it, or drop it. */
export function ItineraryEditor({ trip, people, fresh, numbers, dayFilter, onDayFilter, onOpenPlace, onAsk }: Props) {
  const { removeItem, addToTrip, moveItem } = useTrips();
  const [swapping, setSwapping] = useState<string | undefined>(undefined);
  const days = trip.days.map((d, i) => ({ d, i })).filter(({ i }) => dayFilter === "all" || dayFilter === i);

  const remove = (day: number, itemId: string) => {
    const item = trip.days[day]?.items.find((x) => x.id === itemId);
    if (!item) return;
    removeItem(trip.id, day, itemId);
    toast(`Removed ${item.place.name}`, { description: `Day ${day + 1}`, action: { label: "Undo", onClick: () => addToTrip(trip.id, day, item.place, item.time, item.note) } });
  };

  const move = (from: number, itemId: string, to: number) => {
    const item = trip.days[from]?.items.find((x) => x.id === itemId);
    moveItem(trip.id, from, itemId, to);
    toast.success(`Moved ${item?.place.name ?? "stop"} to Day ${to + 1}`, { action: { label: "Undo", onClick: () => moveItem(trip.id, to, itemId, from) } });
  };

  return (
    <div>
      <div role="tablist" aria-label="Filter by day" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 scrollbar-thin">
        {(["all", ...trip.days.map((_, i) => i)] as const).map((k) => {
          const active = dayFilter === k;
          const count = k === "all" ? trip.days.reduce((n, d) => n + d.items.length, 0) : trip.days[k].items.length;
          return (
            <button
              key={String(k)}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onDayFilter(k)}
              className={cn(
                "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors",
                active ? "bg-secondary text-secondary-foreground" : "border border-border bg-card text-foreground/70 hover:text-foreground",
              )}
            >
              {k !== "all" ? <span className="size-2 rounded-full" style={{ background: dayColor(k) }} /> : null}
              {k === "all" ? "All days" : `Day ${k + 1}`}
              <span className={cn("text-[11px] tabular-nums", active ? "text-secondary-foreground/65" : "text-muted-foreground")}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-5">
        {days.map(({ d, i }) => (
          <section key={i} aria-label={`Day ${i + 1}`}>
            <header className="flex items-baseline gap-2">
              <span className="size-2.5 shrink-0 self-center rounded-full" style={{ background: dayColor(i) }} />
              <h4 className="font-display text-[19px] font-semibold leading-none text-secondary">Day {i + 1}</h4>
              <span className="text-[12.5px] text-muted-foreground">{dayDate(trip, i).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <button type="button" onClick={() => onAsk(`Plan more for day ${i + 1} of my ${trip.city} trip`)} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-primary hover:bg-accent">
                <Sparkles className="size-3" /> {d.items.length ? "Add more" : "Fill this day"}
              </button>
            </header>

            {d.items.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">Open day. Tap "Fill this day" or ask XP for ideas.</p>
            ) : (
              <ol className="mt-2">
                {d.items.map((it, j) => {
                  const next = d.items[j + 1];
                  const leg = next ? legBetween(it.place, next.place) : undefined;
                  const isFresh = fresh.has(it.id);
                  return (
                    <Fragment key={it.id}>
                      <li className={cn("group relative rounded-xl border bg-card transition-colors", isFresh ? "fresh-stop border-primary/40" : "border-border/80 hover:border-secondary/30")}>
                        <div className="flex items-center gap-2.5 p-2">
                          <button type="button" onClick={() => onOpenPlace(it.place)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={`Show ${it.place.name} on the map`}>
                            <span className="relative shrink-0">
                              <img src={placeImage(it.place)} alt="" loading="lazy" className="size-12 rounded-lg object-cover" />
                              <span className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-[10.5px] font-bold text-white ring-2 ring-card" style={{ background: dayColor(i) }}>
                                {numbers[it.id]}
                              </span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5">
                                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground/60">{it.time}</span>
                                <span className="truncate text-[14px] font-semibold leading-tight">{it.place.name}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                                {isFresh ? <span className="font-semibold text-primary">New from {it.addedBy ?? "XP"} · </span> : null}
                                {it.place.cuisine ?? KIND_LABEL[it.place.kind]} · {it.place.neighborhood}
                              </span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </div>
                        <div className="flex border-t border-border/70">
                          <button
                            type="button"
                            onClick={() => setSwapping((v) => (v === it.id ? undefined : it.id))}
                            aria-expanded={swapping === it.id}
                            className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-bl-xl text-[12.5px] font-semibold transition-colors", swapping === it.id ? "bg-secondary text-secondary-foreground" : "text-secondary hover:bg-muted")}
                          >
                            <ArrowLeftRight className="size-3.5" /> Swap
                          </button>
                          <span className="w-px bg-border/70" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label={`More options for ${it.place.name}`} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-br-xl text-[12.5px] font-semibold text-foreground/70 hover:bg-muted">
                                <MoreHorizontal className="size-3.5" /> Move or remove
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-xl">
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Move to</DropdownMenuLabel>
                              {trip.days.map((_, k) =>
                                k === i ? null : (
                                  <DropdownMenuItem key={k} onSelect={() => move(i, it.id, k)}>
                                    <CalendarClock className="mr-2 size-4" style={{ color: dayColor(k) }} /> Day {k + 1}
                                    <span className="ml-auto text-xs text-muted-foreground">{dayDate(trip, k).toLocaleDateString("en-US", { weekday: "short" })}</span>
                                  </DropdownMenuItem>
                                ),
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => remove(i, it.id)}>
                                <Trash2 className="mr-2 size-4" /> Remove from trip
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                      {swapping === it.id ? (
                        <li className="mt-1.5 list-none">
                          <SwapList trip={trip} item={it} day={i} people={people} onAsk={onAsk} onSwapped={() => setSwapping(undefined)} />
                        </li>
                      ) : null}
                      {leg ? (
                        <li className="flex list-none items-center gap-2 py-1.5 pl-6 text-[11.5px] text-muted-foreground" aria-label={leg.label}>
                          <span className="h-4 border-l-2 border-dotted" style={{ borderColor: dayColor(i) }} />
                          {leg.mode === "walk" ? <Footprints className="size-3" /> : <TramFront className="size-3" />}
                          {leg.minutes} min {leg.mode === "walk" ? "walk" : "ride"}
                        </li>
                      ) : (
                        <li className="h-2 list-none" aria-hidden />
                      )}
                    </Fragment>
                  );
                })}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
