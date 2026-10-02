import { Bookmark, Clapperboard, Copy, ExternalLink, Flag, Heart, Loader2, MapPin, MoreHorizontal, Newspaper, Plus, Route, Share2, Star, Trash2, Users } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompatBadge } from "@/components/xp/CompatBadge";
import { type CityOption, type FeedLocation, FeedLocationFilter, locationLabel } from "@/components/xp/FeedLocationFilter";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { ReportDialog } from "@/components/xp/ReportDialog";
import { TripRecap } from "@/components/xp/TripRecap";
import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { KIND_LABEL, placeImage } from "@/data/places";
import { useCompatibility } from "@/hooks/use-compat";
import { useCommunityScores, useFeed, useFeedActions } from "@/hooks/use-feed";
import { bookingLinkFor } from "@/lib/booking";
import { type FeedPost, normCity, placeFromSnap, postCity, postPoints, relTime, visitLabel } from "@/lib/feed";
import { distanceKm } from "@/lib/geo";
import { reversePlace } from "@/lib/geocode";
import { type RecapData, recapFromPost } from "@/lib/recap";
import { matchPlace } from "@/lib/match";
import { photoSrc } from "@/lib/photos";
import { TIER_META } from "@/lib/ranking";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";
import type { Trip } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useList } from "@/providers/ListProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { formatRange, useTrips } from "@/providers/TripsProvider";

type Filter = "all" | "matched" | "trips" | "mine";

const NEAR_KM = 30;
const CITY_KM = 25;

const shortDates = (start: string, end: string): string => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return s.getMonth() === e.getMonth() ? `${m(s)} ${s.getDate()}–${e.getDate()}` : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}`;
};

/** Community feed: what travelers rated and the trips they took, ready to save, rate or copy. */
export default function Feed() {
  const { user } = useAuth();
  const { data: posts, isLoading, error } = useFeed();
  const { compatFor } = useCompatibility();
  const { trips } = useTrips();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [near, setNear] = useState<Extract<FeedLocation, { kind: "near" }> | null>(null);
  const [locating, setLocating] = useState<boolean>(false);

  // The chosen city lives in the URL (?city=) so it survives reloads and can be shared.
  const cityParam = params.get("city") ?? "";
  const location: FeedLocation = near ? near : cityParam ? { kind: "city", city: cityParam, source: trips.some((t) => t.city === cityParam) ? "trip" : "feed" } : { kind: "anywhere" };

  const setLocation = useCallback(
    (v: FeedLocation) => {
      if (v.kind !== "near") setNear(null);
      const next = new URLSearchParams(params);
      if (v.kind === "city") next.set("city", v.city);
      else next.delete("city");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Your browser can't share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const here = await reversePlace(lat, lng);
        const label = here?.city || here?.neighborhood || "you";
        setLocation({ kind: "anywhere" });
        setNear({ kind: "near", lat, lng, label, radiusKm: NEAR_KM });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location is blocked for this site" : "Couldn't find your location", {
          description: err.code === err.PERMISSION_DENIED ? "Allow location in your browser settings, or pick a city instead." : "Try again, or pick a city instead.",
        });
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  }, [setLocation]);

  const inLocation = useCallback(
    (p: FeedPost): boolean => {
      if (location.kind === "anywhere") return true;
      if (location.kind === "near") return postPoints(p).some((pt) => distanceKm(pt, location) <= location.radiusKm);
      if (normCity(postCity(p)) === normCity(location.city)) return true;
      const trip = trips.find((t) => t.city === location.city);
      return Boolean(trip && postPoints(p).some((pt) => distanceKm(pt, { lat: trip.center[0], lng: trip.center[1] }) <= CITY_KM));
    },
    [location, trips],
  );

  const { destinations, feedCities } = useMemo(() => {
    const all = posts ?? [];
    const counts = new Map<string, { city: string; count: number }>();
    all.forEach((p) => {
      const c = postCity(p);
      if (!c) return;
      const k = normCity(c);
      const rec = counts.get(k) ?? { city: c, count: 0 };
      rec.count += 1;
      counts.set(k, rec);
    });
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    const dest: CityOption[] = [...trips]
      .sort((a, b) => Number(b.endDate >= today) - Number(a.endDate >= today) || a.startDate.localeCompare(b.startDate))
      .filter((t) => (seen.has(t.city) ? false : (seen.add(t.city), true)))
      .map((t) => ({
        city: t.city,
        when: shortDates(t.startDate, t.endDate),
        count: all.filter((p) => normCity(postCity(p)) === normCity(t.city) || postPoints(p).some((pt) => distanceKm(pt, { lat: t.center[0], lng: t.center[1] }) <= CITY_KM)).length,
      }));
    return { destinations: dest, feedCities: [...counts.values()].sort((a, b) => b.count - a.count) };
  }, [posts, trips]);

  const list = useMemo(() => {
    const all = (posts ?? []).filter(inLocation);
    const score = (p: FeedPost) => compatFor(p.userId)?.score ?? 0;
    if (filter === "trips") return all.filter((p) => p.type === "trip");
    if (filter === "mine") return all.filter((p) => p.userId === user?.id);
    if (filter === "matched") return all.filter((p) => p.userId !== user?.id && score(p) >= 70).sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt);
    return all;
  }, [posts, filter, user?.id, compatFor, inLocation]);

  const [recap, setRecap] = useState<RecapData | null>(null);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "Everyone" },
    { id: "matched", label: "Your taste matches" },
    { id: "trips", label: "Trips" },
    ...(user ? [{ id: "mine" as const, label: "Your posts" }] : []),
  ];

  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-4 pb-16 pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Feed</p>
            <h1 className="mt-2 text-[48px] font-semibold leading-none text-secondary sm:text-[56px]">From real trips</h1>
            <p className="mt-2 max-w-lg text-foreground/70">Places travelers rated and the trips they took. Save what you like, or copy a whole trip in one tap.</p>
          </div>
          <button type="button" onClick={() => setShareOpen(true)} className="press inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90">
            <Share2 className="size-[18px]" /> Share a trip
          </button>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <FeedLocationFilter
            value={location}
            onChange={setLocation}
            destinations={destinations}
            feedCities={feedCities}
            locating={locating}
            onLocate={locate}
            nearCount={near ? list.length : undefined}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={cn("rounded-full border px-3.5 py-1.5 text-sm", filter === f.id ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-5">
          {isLoading ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="surface p-6 text-center text-muted-foreground">The feed didn't load. Check your connection and try again.</p>
          ) : list.length ? (
            list.map((p, i) => (p.type === "trip" ? <TripPost key={p.id} post={p} index={i} onRecap={setRecap} /> : <LogPost key={p.id} post={p} index={i} />))
          ) : location.kind !== "anywhere" ? (
            <EmptyPlace label={locationLabel(location)} onClear={() => setLocation({ kind: "anywhere" })} />
          ) : (
            <EmptyFeed filter={filter} />
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <TopRated />
        <div className="surface p-5">
          <p className="eyebrow">Add to the feed</p>
          <p className="mt-2 text-sm text-foreground/75">Rate places you've been. Each rating shows up here with your photos and favorite dishes.</p>
          <Link to="/list" className="press mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground">
            <Star className="size-4" /> Rate places
          </Link>
        </div>
      </aside>

      <ShareTripDialog open={shareOpen} onOpenChange={setShareOpen} />
      <TripRecap data={recap} onClose={() => setRecap(null)} />
    </div>
  );
}

function EmptyPlace({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="surface p-10 text-center">
      <MapPin className="mx-auto size-8 text-primary" />
      <p className="mt-3 font-display text-2xl font-semibold text-secondary">Nothing rated {label.startsWith("Near") ? label.toLowerCase() : `in ${label}`} yet</p>
      <p className="mx-auto mt-1 max-w-sm text-muted-foreground">Be the first to rate a spot here, or look further afield.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/list" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
          <Star className="size-4" /> Rate places
        </Link>
        <button type="button" onClick={onClear} className="press inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 font-semibold hover:bg-muted">
          Show everywhere
        </button>
      </div>
    </div>
  );
}

function EmptyFeed({ filter }: { filter: Filter }) {
  return (
    <div className="surface p-10 text-center">
      <Newspaper className="mx-auto size-8 text-primary" />
      <p className="mt-3 font-display text-2xl font-semibold text-secondary">{filter === "matched" ? "No posts from your matches yet" : filter === "mine" ? "You haven't posted yet" : "The feed is just getting started"}</p>
      <p className="mx-auto mt-1 max-w-sm text-muted-foreground">Be one of the first: rate a few places you've loved, or share a trip you took.</p>
      <Link to="/list" className="press mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
        <Star className="size-4" /> Rate places
      </Link>
    </div>
  );
}

function PostHeader({ post, verb }: { post: FeedPost; verb: string }) {
  const { user } = useAuth();
  const { compatFor } = useCompatibility();
  const { remove } = useFeedActions();
  const [reporting, setReporting] = useState<boolean>(false);
  const mine = post.userId === user?.id;
  const compat = mine ? undefined : compatFor(post.userId);
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <Link to={mine ? "/list?tab=been" : `/travelers/${encodeURIComponent(post.userId)}`}>
        <PersonAvatar name={post.name} src={post.avatar} className="size-10" />
      </Link>
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        <p className="truncate">
          <span className="font-semibold">{mine ? "You" : post.name}</span> <span className="text-foreground/65">{verb}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          {relTime(post.createdAt)}
          {compat ? <CompatBadge compat={compat} name={post.name} /> : null}
        </p>
      </div>
      {!mine ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Post options" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onSelect={() => (user ? setReporting(true) : toast("Sign in to report posts"))}>
                <Flag className="mr-2 size-4" /> Report post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ReportDialog postId={post.id} name={post.name} open={reporting} onOpenChange={setReporting} />
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Post options" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => remove.mutate(post.id)}>
              <Trash2 className="mr-2 size-4" /> Delete post
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function LikeButton({ post }: { post: FeedPost }) {
  const { user } = useAuth();
  const { like } = useFeedActions();
  const liked = Boolean(user && post.likes.includes(user.id));
  return (
    <button
      type="button"
      onClick={() => (user ? like.mutate(post.id) : toast("Sign in to like posts"))}
      aria-pressed={liked}
      className={cn("press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold", liked ? "text-primary" : "text-foreground/65 hover:bg-muted")}
    >
      <Heart className={cn("size-[18px] transition-transform", liked && "scale-110 fill-primary")} /> {post.likes.length || ""}
    </button>
  );
}

const LogPost = memo(function LogPost({ post, index }: { post: FeedPost; index: number }) {
  const { profile } = useProfile();
  const { isWant, toggleWant, openRate, logFor } = useList();
  const place = useMemo(() => (post.place ? placeFromSnap(post.place) : undefined), [post.place]);
  if (!place || !post.tier) return null;
  const tier = TIER_META[post.tier];
  const photos = post.photos.length ? post.photos.map(photoSrc) : [placeImage(place)];
  const mine = logFor(place.id);
  const match = place.custom ? undefined : matchPlace(profile, place).score;
  const booking = bookingLinkFor(place);
  const verb = post.tier === "loved" ? "loved" : post.tier === "liked" ? "liked" : "rated";

  return (
    <article className="surface animate-rise overflow-hidden" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
      <PostHeader post={post} verb={verb} />
      <div className="px-4 pt-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[26px] font-semibold leading-tight text-secondary">{place.name}</h2>
            <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5" />
              {[place.cuisine ?? KIND_LABEL[place.kind], place.neighborhood, place.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="grid size-[54px] shrink-0 place-items-center rounded-full font-display text-[20px] font-bold text-white shadow" style={{ background: tier.color }} title={tier.label}>
            {(post.score ?? 0).toFixed(1)}
          </span>
        </div>
      </div>

      <div className={cn("mt-3 grid gap-1 px-4", photos.length === 1 ? "grid-cols-1" : photos.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {photos.slice(0, 3).map((src, i) => (
          <div key={src} className={cn("relative overflow-hidden rounded-xl bg-muted", photos.length === 1 ? "aspect-[16/9]" : photos.length >= 3 && i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square")}>
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            {i === 2 && photos.length > 3 ? <span className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-bold text-white">+{photos.length - 3}</span> : null}
          </div>
        ))}
      </div>

      <div className="space-y-2 px-4 pt-3 text-[14px]">
        {post.note ? <p className="leading-relaxed text-foreground/85">"{post.note}"</p> : null}
        {post.dishes.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Order</span>
            {post.dishes.map((d) => (
              <span key={d} className="rounded-full bg-accent px-2.5 py-0.5 text-[13px] font-medium text-primary">
                {d}
              </span>
            ))}
          </div>
        ) : null}
        <p className="flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
          {post.visitedOn ? <span>Went {visitLabel(post.visitedOn)}</span> : null}
          {post.with.length ? (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> with {post.with.join(", ")}
            </span>
          ) : null}
          {match !== undefined ? <span className="font-semibold text-primary">{match}% match for you</span> : null}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border/70 px-2 py-2">
        <LikeButton post={post} />
        <button type="button" onClick={() => toggleWant(place)} aria-pressed={isWant(place.id)} className={cn("press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold", isWant(place.id) ? "text-primary" : "text-foreground/65 hover:bg-muted")}>
          <Bookmark className={cn("size-[18px]", isWant(place.id) && "fill-primary")} /> {isWant(place.id) ? "Saved" : "Want to go"}
        </button>
        <button type="button" onClick={() => openRate(place)} className="press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-foreground/65 hover:bg-muted">
          <Star className="size-[18px]" /> {mine ? `You: ${mine.score.toFixed(1)}` : "Been? Rate it"}
        </button>
        <a href={booking.url} target="_blank" rel="noopener noreferrer sponsored" className="press ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-[13px] font-semibold text-secondary-foreground">
          {booking.label} <ExternalLink className="size-3.5" />
        </a>
      </div>
    </article>
  );
});

const TripPost = memo(function TripPost({ post, index, onRecap }: { post: FeedPost; index: number; onRecap: (d: RecapData) => void }) {
  const { user } = useAuth();
  const { createTrip, upsertTrip, trips } = useTrips();
  const { newChat } = useConcierge();
  const { markCopied } = useFeedActions();
  const navigate = useNavigate();
  const trip = post.trip;
  if (!trip) return null;
  const stops = trip.days.flatMap((d) => d.items);
  const cover = post.photos[0] ? photoSrc(post.photos[0]) : trip.cover || (stops[0] ? placeImage(placeFromSnap(stops[0].place)) : "");
  const copied = Boolean(user && post.copiedBy.includes(user.id));

  const copy = () => {
    const start = new Date(Date.now() + 30 * 86_400_000);
    const len = Math.max(1, trip.days.length);
    const end = new Date(start.getTime() + (len - 1) * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const base = createTrip(trip.city, iso(start), iso(end));
    const full: Trip = {
      ...base,
      country: trip.country || base.country,
      cover: trip.cover || base.cover,
      center: stops[0] ? [stops[0].place.lat, stops[0].place.lng] : base.center,
      blurb: `Copied from ${firstName(post.name)}'s trip.${post.note ? ` "${post.note.slice(0, 120)}"` : ""}`,
      days: base.days.map((_, i) => ({
        items: (trip.days[i]?.items ?? []).map((it, j) => ({ id: `it-${Date.now().toString(36)}-${i}-${j}`, time: it.time, place: placeFromSnap(it.place), note: it.note, addedAt: Date.now(), addedBy: firstName(post.name), addedById: post.userId })),
      })),
    };
    upsertTrip(full);
    newChat({ tripId: full.id, title: `${trip.city} · ${firstName(post.name)}'s trip` });
    if (user) markCopied.mutate(post.id);
    toast.success(`Copied ${firstName(post.name)}'s ${trip.city} trip`, { description: "Dates start a month out. Change them anytime.", action: { label: "Open", onClick: () => navigate(`/trips/${full.id}`) } });
    navigate(`/trips/${full.id}`);
  };

  return (
    <article className="surface animate-rise overflow-hidden" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
      <PostHeader post={post} verb={`shared a ${trip.days.length}-day trip`} />
      <div className="relative mx-4 mt-3 aspect-[16/8] overflow-hidden rounded-xl bg-muted">
        {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F2A44]/90 via-[#1F2A44]/20 to-transparent" />
        <button
          type="button"
          onClick={() => onRecap(recapFromPost(post))}
          className="press absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1F2A44]/80 px-3 text-[13px] font-semibold text-white backdrop-blur-sm hover:bg-[#1F2A44]"
        >
          <Clapperboard className="size-4" /> Watch recap
        </button>
        <div className="absolute inset-x-5 bottom-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
            {trip.days.length} days · {stops.length} stops
          </p>
          <h2 className="font-display text-[34px] font-semibold leading-none">{post.title || trip.city}</h2>
          {trip.startDate && trip.endDate ? <p className="mt-1 text-[13px] text-white/75">{formatRange(trip.startDate, trip.endDate)}</p> : null}
        </div>
      </div>
      {post.note ? <p className="px-4 pt-3 text-[14px] leading-relaxed text-foreground/85">"{post.note}"</p> : null}
      <ol className="mx-4 mt-3 space-y-1.5">
        {trip.days.slice(0, 3).map((d, i) =>
          d.items.length ? (
            <li key={i} className="flex gap-3 text-[13.5px]">
              <span className="w-12 shrink-0 font-semibold text-primary">Day {i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-foreground/80">{d.items.map((it) => it.place.name).join(" → ")}</span>
            </li>
          ) : null,
        )}
        {trip.days.length > 3 ? <li className="pl-[60px] text-[12.5px] text-muted-foreground">+ {trip.days.length - 3} more days</li> : null}
      </ol>
      <div className="mt-3 flex items-center gap-1 border-t border-border/70 px-2 py-2">
        <LikeButton post={post} />
        <span className="inline-flex items-center gap-1.5 px-2 text-sm text-foreground/60">
          <Copy className="size-4" /> {post.copiedBy.length} {post.copiedBy.length === 1 ? "copy" : "copies"}
        </span>
        {post.userId === user?.id ? null : (
          <button type="button" onClick={copy} className="press ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Route className="size-4" /> {copied || trips.some((t) => t.blurb.startsWith(`Copied from ${firstName(post.name)}`) && t.city === trip.city) ? "Copy again" : "Copy this trip"}
          </button>
        )}
      </div>
    </article>
  );
});

function TopRated() {
  const { data } = useCommunityScores();
  const { openRate } = useList();
  const top = useMemo(
    () =>
      Object.entries(data ?? {})
        .filter(([, s]) => s.count >= 1)
        .sort((a, b) => b[1].avg * Math.min(1, 0.6 + b[1].count * 0.1) - a[1].avg * Math.min(1, 0.6 + a[1].count * 0.1))
        .slice(0, 6),
    [data],
  );
  const { data: posts } = useFeed();
  if (!top.length) return null;
  return (
    <div className="surface p-5">
      <p className="eyebrow">Top rated by travelers</p>
      <ol className="mt-3 space-y-2.5">
        {top.map(([id, s], i) => {
          const snap = posts?.find((p) => p.place?.id === id)?.place;
          return (
            <li key={id}>
              <button type="button" disabled={!snap} onClick={() => snap && openRate(placeFromSnap(snap))} className="flex w-full items-center gap-2.5 text-left">
                <span className="w-4 font-display text-base font-semibold text-foreground/40">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {s.count} {s.count === 1 ? "rating" : "ratings"}
                    {s.loved ? ` · ${s.loved} loved` : ""}
                  </span>
                </span>
                <span className="font-display text-lg font-bold tabular-nums" style={{ color: s.avg >= 7 ? TIER_META.loved.color : s.avg >= 4 ? TIER_META.liked.color : TIER_META.meh.color }}>
                  {s.avg.toFixed(1)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ShareTripDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { trips } = useTrips();
  const { shareTrip, logs } = useList();
  const shareable = useMemo(() => trips.filter((t) => t.days.some((d) => d.items.length)), [trips]);
  const [tripId, setTripId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const trip = shareable.find((t) => t.id === tripId) ?? shareable[0];

  const submit = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      const ids = new Set(trip.days.flatMap((d) => d.items.map((x) => x.place.id)));
      const photos = logs.filter((l) => ids.has(l.id)).flatMap((l) => l.photos).filter((p) => !p.startsWith("data:")).slice(0, 6);
      await shareTrip(trip, title.trim() || `${trip.days.length} days in ${trip.city}`, note.trim(), photos);
      toast.success("Trip shared to the feed", { description: "Anyone can copy it in one tap." });
      onOpenChange(false);
      setTitle("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't share the trip.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[30px] font-semibold text-secondary">Share a trip</DialogTitle>
          <DialogDescription>Post an itinerary so other travelers can copy it, stop by stop.</DialogDescription>
        </DialogHeader>
        {!user ? (
          <SignInPrompt title="Sign in to share" body="Trips on the feed show your name and photo so people know whose trip they're copying." className="border-0 p-0 shadow-none" />
        ) : !shareable.length ? (
          <div className="py-6 text-center text-muted-foreground">
            <p>None of your trips have stops yet.</p>
            <Link to="/list" onClick={() => onOpenChange(false)} className="mt-3 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
              <Plus className="size-4" /> Rebuild one from your photos
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {shareable.map((t) => (
                <button key={t.id} type="button" onClick={() => setTripId(t.id)} className={cn("flex items-center gap-3 rounded-xl border p-2 text-left", trip?.id === t.id ? "border-primary bg-accent/60" : "border-border hover:bg-muted")}>
                  <img src={t.cover} alt="" className="size-12 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.city}</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {formatRange(t.startDate, t.endDate)} · {t.days.reduce((n, d) => n + d.items.length, 0)} stops
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={trip ? `${trip.days.length} days in ${trip.city}` : "Title"} aria-label="Title" className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary/60" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} placeholder="What made this trip great? Any tips?" aria-label="Note" className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button type="button" onClick={() => void submit()} disabled={busy} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />} Post to the feed
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
