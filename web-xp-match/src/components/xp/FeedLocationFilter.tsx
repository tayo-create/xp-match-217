import { Check, ChevronDown, Globe2, Loader2, LocateFixed, Luggage, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Where the feed is scoped to. */
export type FeedLocation =
  | { kind: "anywhere" }
  | { kind: "near"; lat: number; lng: number; label: string; radiusKm: number }
  | { kind: "city"; city: string; source: "trip" | "feed" };

export interface CityOption {
  city: string;
  count: number;
  /** Trip dates, for saved destinations. */
  when?: string;
}

interface Props {
  value: FeedLocation;
  onChange: (v: FeedLocation) => void;
  destinations: CityOption[];
  feedCities: CityOption[];
  locating: boolean;
  onLocate: () => void;
  nearCount?: number;
}

export const locationLabel = (v: FeedLocation): string =>
  v.kind === "anywhere" ? "Anywhere" : v.kind === "near" ? `Near ${v.label}` : v.city;

/** Location scope for the feed: anywhere, near me, one of my trip destinations, or any city on the feed. */
export function FeedLocationFilter({ value, onChange, destinations, feedCities, locating, onLocate, nearCount }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");
  const active = value.kind !== "anywhere";
  const others = useMemo(() => {
    const trip = new Set(destinations.map((d) => d.city.toLowerCase()));
    const needle = q.trim().toLowerCase();
    return feedCities.filter((c) => !trip.has(c.city.toLowerCase()) && (!needle || c.city.toLowerCase().includes(needle)));
  }, [feedCities, destinations, q]);

  const pick = (v: FeedLocation) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "press inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
            aria-label={`Location: ${locationLabel(value)}`}
          >
            {value.kind === "near" ? <LocateFixed className="size-4" /> : value.kind === "city" ? <MapPin className="size-4" /> : <Globe2 className="size-4" />}
            <span className="max-w-[160px] truncate">{locationLabel(value)}</span>
            <ChevronDown className="size-3.5 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] rounded-2xl p-2">
          <Row icon={<Globe2 className="size-4" />} label="Anywhere" sub="Every rated place and trip" selected={value.kind === "anywhere"} onClick={() => pick({ kind: "anywhere" })} />
          <Row
            icon={locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
            label="Near me"
            sub={value.kind === "near" ? `Within ${value.radiusKm} km of ${value.label}${nearCount !== undefined ? ` · ${nearCount} posts` : ""}` : "Uses your current location once"}
            selected={value.kind === "near"}
            onClick={() => {
              onLocate();
              setOpen(false);
            }}
          />

          {destinations.length ? (
            <>
              <p className="eyebrow px-2 pb-1 pt-3">Your destinations</p>
              {destinations.map((d) => (
                <Row
                  key={d.city}
                  icon={<Luggage className="size-4" />}
                  label={d.city}
                  sub={`${d.when ?? "Saved trip"} · ${d.count ? `${d.count} ${d.count === 1 ? "post" : "posts"}` : "no posts yet"}`}
                  selected={value.kind === "city" && value.city === d.city}
                  onClick={() => pick({ kind: "city", city: d.city, source: "trip" })}
                />
              ))}
            </>
          ) : null}

          {feedCities.length ? (
            <>
              <p className="eyebrow px-2 pb-1 pt-3">Cities on the feed</p>
              {feedCities.length > 6 ? (
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a city" aria-label="Find a city" className="mx-1 mb-1 h-9 w-[calc(100%-8px)] rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary/60" />
              ) : null}
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
                {others.map((c) => (
                  <Row key={c.city} icon={<MapPin className="size-4" />} label={c.city} sub={`${c.count} ${c.count === 1 ? "post" : "posts"}`} selected={value.kind === "city" && value.city === c.city} onClick={() => pick({ kind: "city", city: c.city, source: "feed" })} />
                ))}
                {!others.length ? <p className="px-2 py-2 text-[13px] text-muted-foreground">No other cities yet.</p> : null}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
      {active ? (
        <button type="button" onClick={() => onChange({ kind: "anywhere" })} aria-label="Clear location" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function Row({ icon, label, sub, selected, onClick }: { icon: React.ReactNode; label: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left", selected ? "bg-accent" : "hover:bg-muted")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{label}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>
      </span>
      {selected ? <Check className="size-4 text-primary" /> : null}
    </button>
  );
}
