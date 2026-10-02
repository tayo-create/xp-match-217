import { useQuery } from "@tanstack/react-query";
import { Bookmark, Globe, Loader2, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { KIND_LABEL, PLACES, placeImage } from "@/data/places";
import { searchPlaces } from "@/lib/geocode";
import { TIER_META } from "@/lib/ranking";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/types";
import { useList } from "@/providers/ListProvider";

/** Find any place: our curated catalog first, then anywhere in the world (OpenStreetMap). */
export function PlaceSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState<string>("");
  const [debounced, setDebounced] = useState<string>("");
  const { openRate, isWant, toggleWant, logFor } = useList();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 550);
    return () => window.clearTimeout(t);
  }, [q]);

  const local = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return PLACES.filter((p) => p.name.toLowerCase().includes(s) || p.city.toLowerCase().includes(s) || p.neighborhood.toLowerCase().includes(s) || (p.cuisine ?? "").toLowerCase().includes(s)).slice(0, 5);
  }, [q]);

  const world = useQuery({
    queryKey: ["place-search", debounced],
    queryFn: ({ signal }) => searchPlaces(debounced, signal),
    enabled: debounced.length >= 3,
    staleTime: 5 * 60_000,
  });

  const worldResults = useMemo(() => {
    const names = new Set(local.map((p) => p.name.toLowerCase()));
    return (world.data ?? []).filter((p) => !names.has(p.name.toLowerCase())).slice(0, 5);
  }, [world.data, local]);

  const open = q.trim().length >= 2;

  return (
    <div className={cn("relative", className)}>
      <label className="flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 shadow-sm focus-within:border-primary/60">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search any restaurant, hotel or experience…"
          aria-label="Search places"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-foreground/45"
        />
        {world.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        {q ? (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        ) : null}
      </label>
      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl scrollbar-thin">
          {local.length ? <p className="eyebrow px-2.5 pb-1 pt-2">XP picks</p> : null}
          {local.map((p) => (
            <Row key={p.id} place={p} logged={logFor(p.id)?.score} want={isWant(p.id)} onRate={() => { openRate(p); setQ(""); }} onWant={() => toggleWant(p)} />
          ))}
          {debounced.length >= 3 ? (
            <p className="eyebrow flex items-center gap-1.5 px-2.5 pb-1 pt-3">
              <Globe className="size-3" /> Anywhere
            </p>
          ) : null}
          {worldResults.map((p) => (
            <Row key={p.id} place={p} logged={logFor(p.id)?.score} want={isWant(p.id)} onRate={() => { openRate(p); setQ(""); }} onWant={() => toggleWant(p)} />
          ))}
          {debounced.length >= 3 && !world.isFetching && !worldResults.length && !local.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{world.error ? "Search is busy right now. Try again in a moment." : `Nothing found for "${debounced}". Try adding the city.`}</p>
          ) : null}
          {q.trim().length < 3 && !local.length ? <p className="px-3 py-4 text-sm text-muted-foreground">Keep typing…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ place, logged, want, onRate, onWant }: { place: Place; logged?: number; want: boolean; onRate: () => void; onWant: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/70">
      <img src={placeImage(place)} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{place.name}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">{[place.cuisine ?? KIND_LABEL[place.kind], place.neighborhood, place.city].filter(Boolean).join(" · ")}</p>
      </div>
      <button type="button" onClick={onWant} aria-pressed={want} aria-label={want ? "Remove from want to go" : "Want to go"} className={cn("press grid size-9 shrink-0 place-items-center rounded-lg border", want ? "border-primary/40 bg-accent text-primary" : "border-border text-foreground/60 hover:bg-muted")}>
        <Bookmark className={cn("size-4", want && "fill-primary")} />
      </button>
      <button type="button" onClick={onRate} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-[13px] font-semibold text-secondary-foreground">
        {logged !== undefined ? (
          <>
            <span className="tabular-nums">{logged.toFixed(1)}</span> Edit
          </>
        ) : (
          <>
            <Star className="size-3.5" /> Rate
          </>
        )}
      </button>
    </div>
  );
}

export const tierColor = (score: number): string => (score >= 7 ? TIER_META.loved.color : score >= 4 ? TIER_META.liked.color : TIER_META.meh.color);
