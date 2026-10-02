import { ArrowLeft, Bookmark, Bus, Clapperboard, Download, Footprints, Loader2, MoreHorizontal, Pencil, Plus, Share2, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareDialog } from "@/components/xp/ShareDialog";
import { TripRecap } from "@/components/xp/TripRecap";
import { type RecapData, recapFromTrip } from "@/lib/recap";
import { useList } from "@/providers/ListProvider";
import { TripMap, type MapStop } from "@/components/xp/TripMap";
import { KIND_LABEL, placeImage } from "@/data/places";
import { useCityPlaces } from "@/hooks/use-city-places";
import { legBetween } from "@/lib/geo";
import { matchPlace, rankPlaces } from "@/lib/match";
import { uid } from "@/lib/persist";
import { cn } from "@/lib/utils";
import type { Place, PlaceKind } from "@/lib/types";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";
import { dayDate, formatRange, useTrips } from "@/providers/TripsProvider";

/** Day-by-day itinerary beside a live map, with shared-taste callouts. */
export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { tripById, removeItem, updateItemTime, moveItem, isSaved, toggleSaved } = useTrips();
  const { profile } = useProfile();
  const { travelerMatches } = useSocial();
  const { chats, setActiveId, newChat, send } = useConcierge();
  const trip = tripById(id);

  const dayParam = Number(params.get("day") ?? "") - 1;
  const [day, setDay] = useState<number>(Number.isFinite(dayParam) && dayParam >= 0 ? dayParam : 1);
  const [activeItem, setActiveItem] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<boolean>(false);
  const [customOpen, setCustomOpen] = useState<boolean>(false);
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const { logFor } = useList();

  const safeDay = trip ? Math.min(day, trip.days.length - 1) : 0;
  const items = useMemo(() => trip?.days[safeDay]?.items ?? [], [trip, safeDay]);
  const stops = useMemo<MapStop[]>(() => items.map((it) => ({ id: it.id, place: it.place, time: it.time, day: safeDay })), [items, safeDay]);
  const dayTotals = useMemo(() => {
    let km = 0;
    let minutes = 0;
    for (let i = 1; i < items.length; i++) {
      const leg = legBetween(items[i - 1].place, items[i].place);
      km += leg.km;
      minutes += leg.minutes;
    }
    return { km, minutes };
  }, [items]);
  const linkedChat = useMemo(() => chats.find((c) => c.tripId === id), [chats, id]);

  /** Places in this trip also saved by a high-match traveler. */
  const shared = useMemo(() => {
    if (!trip) return [];
    const ids = new Set(trip.days.flatMap((d) => d.items.map((x) => x.place.id)));
    const out: { travelerId: string; name: string; avatar: string; score: number; place: Place }[] = [];
    travelerMatches
      .filter((m) => m.score >= 80)
      .forEach(({ traveler, score }) => {
        traveler.savedPlaceIds.forEach((pid) => {
          if (!ids.has(pid)) return;
          const it = trip.days.flatMap((d) => d.items).find((x) => x.place.id === pid);
          if (it) out.push({ travelerId: traveler.id, name: traveler.name.split(" ")[0], avatar: traveler.avatar, score, place: it.place });
        });
      });
    return out;
  }, [trip, travelerMatches]);

  const sharedToday = shared.find((s) => items.some((x) => x.place.id === s.place.id)) ?? shared[0];

  if (!trip) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="font-display text-4xl text-secondary">Trip not found</p>
        <Link to="/trips" className="mt-4 inline-block font-medium text-primary">
          Back to trips
        </Link>
      </div>
    );
  }

  const selectDay = (i: number) => {
    setDay(i);
    setActiveItem(undefined);
    params.set("day", String(i + 1));
    setParams(params, { replace: true });
  };

  const refine = () => {
    const existing = chats.find((c) => c.tripId === trip.id);
    const chatId = existing ? existing.id : newChat({ tripId: trip.id });
    if (existing) setActiveId(existing.id);
    send(`Refine Day ${safeDay + 1} of my ${trip.city} trip. Suggest what to add or swap based on my taste.`, chatId, trip.id);
    navigate(`/c/${chatId}`);
  };

  const date = dayDate(trip, safeDay);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { downloadTripPdf } = await import("@/lib/pdf");
      await downloadTripPdf(trip, { owner: profile.name });
      toast.success("PDF downloaded", { description: "Print it or keep it for offline use." });
    } catch (e) {
      console.warn("[pdf] export failed", e instanceof Error ? e.message : e);
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-14 pt-7 sm:px-8">
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          <Link to="/trips" className="inline-flex items-center gap-2 text-[15px] text-foreground/75 hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to trips
          </Link>
          <h1 className="mt-3 text-[56px] font-semibold leading-none text-secondary">{trip.city}</h1>
          <p className="mt-2 text-lg text-foreground/80">{formatRange(trip.startDate, trip.endDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <img src={trip.cover} alt="" className="hidden h-[110px] w-[150px] rounded-xl object-cover md:block" />
          <div className="hidden max-w-[240px] lg:block">
            <p className="text-[15px] leading-snug">{trip.blurb}</p>
            {trip.country ? <p className="mt-2 text-sm text-muted-foreground">{trip.city}, {trip.country}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setShareOpen(true)} aria-label="Share itinerary" className="press inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-4 font-medium hover:bg-muted">
              <Share2 className="size-4" /> Share
            </button>
            <button
              type="button"
              onClick={() => {
                if (!trip.days.some((d) => d.items.length)) return toast("Add a few stops first", { description: "The recap is built from your stops, photos and ratings." });
                setRecap(recapFromTrip(trip, logFor, profile.name));
              }}
              className="press inline-flex h-12 items-center gap-2 rounded-xl bg-secondary px-4 font-semibold text-secondary-foreground hover:bg-secondary/90"
            >
              <Clapperboard className="size-4" /> Recap
            </button>
            <button type="button" onClick={exportPdf} disabled={exporting} aria-label="Download printable PDF" className="press inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-4 font-medium hover:bg-muted disabled:opacity-60">
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF
            </button>
            <button type="button" onClick={() => setCustomOpen(true)} className="press inline-flex h-12 items-center gap-2 rounded-xl border border-primary/60 bg-card px-4 font-medium text-primary hover:bg-accent">
              <Plus className="size-4" /> Add custom stop
            </button>
            <button type="button" onClick={refine} className="press inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">
              <Sparkles className="size-4" /> Refine with AI
            </button>
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Trip days" className="mt-6 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {trip.days.map((d, i) => (
          <button
            key={i}
            role="tab"
            type="button"
            aria-selected={i === safeDay}
            onClick={() => selectDay(i)}
            className={cn(
              "shrink-0 rounded-full px-5 py-2 text-[16px] transition-colors",
              i === safeDay ? "bg-primary font-medium text-primary-foreground shadow-sm" : "text-foreground/85 hover:bg-muted",
            )}
          >
            Day {i + 1}
            {d.items.length ? <span className={cn("ml-1.5 text-xs", i === safeDay ? "text-primary-foreground/80" : "text-muted-foreground")}>{d.items.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="surface p-5 sm:p-7" aria-label={`Day ${safeDay + 1} itinerary`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[32px] font-semibold text-secondary">
                Day {safeDay + 1} · {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </h2>
              {items.length > 1 ? (
                <p className="text-sm text-muted-foreground">
                  {items.length} stops · {dayTotals.km.toFixed(1)} km between them · about {dayTotals.minutes < 60 ? `${dayTotals.minutes} min` : `${Math.floor(dayTotals.minutes / 60)} h ${dayTotals.minutes % 60} min`} getting around
                </p>
              ) : null}
            </div>
            <button type="button" onClick={() => setEditing((v) => !v)} className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[15px] font-medium", editing ? "bg-secondary text-secondary-foreground" : "hover:bg-muted")}>
              {editing ? "Done" : "Edit day"} <Pencil className="size-4" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-2xl text-secondary">An open day</p>
              <p className="mt-1 text-muted-foreground">Add a custom stop, or let the concierge fill it with high-match picks.</p>
              <button type="button" onClick={refine} className="press mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
                <Sparkles className="size-4" /> Fill with AI
              </button>
            </div>
          ) : (
            <ol className="relative mt-6">
              <span className="absolute bottom-6 left-[9px] top-6 border-l-2 border-dashed border-primary/45" aria-hidden />
              {items.map((it, idx) => {
                const m = matchPlace(profile, it.place);
                const saved = isSaved(it.place.id);
                const next = items[idx + 1];
                const leg = next ? legBetween(it.place, next.place) : undefined;
                return (
                  <li key={it.id}>
                  <div
                    onClick={() => setActiveItem(it.id)}
                    onMouseEnter={() => setActiveItem(it.id)}
                    className={cn("relative grid grid-cols-[20px_60px_1fr_auto] items-start gap-3 rounded-xl py-3 pr-1 transition-colors sm:grid-cols-[20px_64px_140px_1fr_auto] sm:gap-4", activeItem === it.id && "bg-muted/50")}
                  >
                    <span className="relative z-10 mt-4 grid size-[22px] -translate-x-0.5 place-items-center rounded-full border-2 border-card bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">{idx + 1}</span>
                    {editing ? (
                      <input
                        type="time"
                        value={it.time}
                        onChange={(e) => e.target.value && updateItemTime(trip.id, safeDay, it.id, e.target.value)}
                        aria-label={`Time for ${it.place.name}`}
                        className="mt-3 h-9 w-[76px] rounded-md border border-input bg-card px-1 text-sm"
                      />
                    ) : (
                      <span className="mt-4 text-[16px] tabular-nums text-foreground/75">{it.time}</span>
                    )}
                    <img src={placeImage(it.place)} alt="" className="hidden h-[100px] w-[140px] rounded-lg object-cover sm:block" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-sans text-[18px] font-semibold">{it.place.name}</h3>
                        {m.score >= 90 ? <span className="match-pill">{m.score}%</span> : null}
                      </div>
                      <p className="mt-0.5 text-[14px] text-muted-foreground">
                        {KIND_LABEL[it.place.kind]} · {it.place.neighborhood}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-[14.5px] leading-snug text-foreground/80">{it.note ?? it.place.blurb}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleSaved(it.place.id)}
                        aria-pressed={saved}
                        aria-label={saved ? "Unsave" : "Save"}
                        className={cn("press grid size-11 place-items-center rounded-xl border", saved ? "border-primary/40 bg-accent text-primary" : "border-border bg-card hover:bg-muted")}
                      >
                        <Bookmark className={cn("size-[18px]", saved && "fill-primary")} />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={`More options for ${it.place.name}`} className="grid size-11 place-items-center rounded-xl hover:bg-muted">
                            <MoreHorizontal className="size-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                          <DropdownMenuItem onSelect={() => navigate(`/reviews?place=${it.place.id}`)}>Read & write reviews</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
                          {trip.days.map((_, i) =>
                            i === safeDay ? null : (
                              <DropdownMenuItem key={i} onSelect={() => { moveItem(trip.id, safeDay, it.id, i); toast(`Moved to Day ${i + 1}`); }}>
                                Day {i + 1}
                              </DropdownMenuItem>
                            ),
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { removeItem(trip.id, safeDay, it.id); toast(`${it.place.name} removed`); }}>
                            Remove from day
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {leg ? (
                    <div className="relative flex items-center gap-2 py-1 pl-9 text-[12.5px] font-medium text-muted-foreground sm:pl-[104px]">
                      {leg.mode === "walk" ? <Footprints className="size-3.5" /> : <Bus className="size-3.5" />}
                      {leg.label}
                    </div>
                  ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="relative h-[420px] overflow-hidden rounded-xl border border-border/70 lg:h-auto lg:min-h-[560px]" aria-label="Map of the day">
          <TripMap stops={stops} center={trip.center} activeId={activeItem} onSelect={setActiveItem} legs />
          {items.length > 1 ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-card/95 px-3 py-1.5 text-[12.5px] font-semibold text-secondary shadow-sm">
              Day {safeDay + 1} route · {items.length} stops in order
            </div>
          ) : null}
        </section>
      </div>

      {sharedToday ? (
        <div className="surface mt-6 flex flex-wrap items-center gap-5 px-6 py-5 animate-rise">
          <div className="flex -space-x-3">
            <PersonAvatar name={sharedToday.name} src={sharedToday.avatar} className="size-14 rounded-full border-2 border-card text-xl" />
            {shared.filter((s) => s.travelerId !== sharedToday.travelerId)[0] ? (
              <PersonAvatar name={shared.filter((s) => s.travelerId !== sharedToday.travelerId)[0].name} src={shared.filter((s) => s.travelerId !== sharedToday.travelerId)[0].avatar} className="size-14 rounded-full border-2 border-card text-xl" />
            ) : null}
          </div>
          <p className="flex-1 text-[17px]">
            <span className="text-primary">
              {sharedToday.name} ({sharedToday.score}% match)
            </span>{" "}
            also saved <span className="font-semibold">{sharedToday.place.name}</span>.
            {shared.length > 1 ? <span className="text-muted-foreground"> +{shared.length - 1} more shared picks on this trip.</span> : null}
          </p>
          <Link to={`/travelers/${encodeURIComponent(sharedToday.travelerId)}`} className="press inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 font-medium text-primary hover:bg-accent">
            <Users className="size-4" /> View traveler profile
          </Link>
        </div>
      ) : null}

      <ShareDialog trip={trip} chat={linkedChat} open={shareOpen} onOpenChange={setShareOpen} defaultTab="public" />
      <TripRecap data={recap} onClose={() => setRecap(null)} />
      <CustomStopDialog open={customOpen} onOpenChange={setCustomOpen} tripId={trip.id} city={trip.city} center={trip.center} dayIndex={safeDay} />
    </div>
  );
}

const KINDS: PlaceKind[] = ["eat", "do", "stay", "nightlife", "move"];

function CustomStopDialog({ open, onOpenChange, tripId, city, center, dayIndex }: { open: boolean; onOpenChange: (v: boolean) => void; tripId: string; city: string; center: [number, number]; dayIndex: number }) {
  const { addToTrip } = useTrips();
  const { profile } = useProfile();
  const [query, setQuery] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [kind, setKind] = useState<PlaceKind>("eat");
  const [time, setTime] = useState<string>("18:00");
  const [note, setNote] = useState<string>("");

  const { places: cityPlaces, isLoading: placesLoading } = useCityPlaces(open ? city : undefined);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = cityPlaces.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q) || (p.cuisine ?? "").toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)),
    );
    return rankPlaces(profile, pool).slice(0, 6);
  }, [query, cityPlaces, profile]);

  const addCatalog = (p: Place) => {
    addToTrip(tripId, dayIndex, p, time);
    toast.success(`${p.name} added to Day ${dayIndex + 1}`);
    onOpenChange(false);
  };

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const jitter = () => (Math.random() - 0.5) * 0.02;
    const p: Place = {
      id: uid("custom"),
      name: name.trim(),
      kind,
      neighborhood: "Custom stop",
      city,
      price: 2,
      blurb: note.trim() || "Added by you.",
      tags: [],
      affinity: { curator: 50, drifter: 50, trailblazer: 50, architect: 50 },
      lat: center[0] + jitter(),
      lng: center[1] + jitter(),
      custom: true,
    };
    addToTrip(tripId, dayIndex, p, time, note.trim() || undefined);
    toast.success(`${p.name} added to Day ${dayIndex + 1}`);
    setName("");
    setNote("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-semibold text-secondary">Add a stop to Day {dayIndex + 1}</DialogTitle>
          <DialogDescription>{placesLoading ? `Finding places around ${city}…` : `Search ${cityPlaces.length} places in ${city}, or add your own.`}</DialogDescription>
        </DialogHeader>
        <label className="block">
          <span className="text-sm font-medium">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 h-11 w-36 rounded-lg border border-input bg-card px-3" />
        </label>
        <div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${city} places…`} aria-label="Search places" className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
          <ul className="mt-2 space-y-1">
            {results.map(({ place, match }) => (
              <li key={place.id}>
                <button type="button" onClick={() => addCatalog(place)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted">
                  <img src={placeImage(place)} alt="" className="size-11 rounded-md object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{place.name}</span>
                    <span className="block text-xs text-muted-foreground">{KIND_LABEL[place.kind]} · {place.neighborhood}</span>
                  </span>
                  <span className="match-pill">{match.score}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={addCustom} className="space-y-3 border-t border-border pt-4">
          <p className="eyebrow">Or add your own</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Place name" aria-label="Custom place name" className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full border px-3 py-1 text-sm", kind === k ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
          <button type="submit" disabled={!name.trim()} className="press h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-40">
            Add custom stop
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
