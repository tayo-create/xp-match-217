import { Bookmark, Camera, ChevronRight, Frown, Heart, ImagePlus, ListOrdered, Smile, Sparkles, Users } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { PhotoImport } from "@/components/xp/list/PhotoImport";
import { PlaceSearch } from "@/components/xp/list/PlaceSearch";
import { CITIES, KIND_LABEL, PLACES, PLACE_BY_ID, placeImage, priceLabel } from "@/data/places";
import { useCommunityScores } from "@/hooks/use-feed";
import { visitLabel } from "@/lib/feed";
import { matchPlace } from "@/lib/match";
import { photoSrc } from "@/lib/photos";
import { TIER_META, TIERS } from "@/lib/ranking";
import { cn } from "@/lib/utils";
import type { ListTier, Place, PlaceKind } from "@/lib/types";
import { type RankedLog, useList } from "@/providers/ListProvider";
import { useProfile } from "@/providers/ProfileProvider";

type Tab = "rate" | "been" | "want";

const TIER_ICON = { loved: Heart, liked: Smile, meh: Frown } as const;
const KIND_FILTERS: (PlaceKind | "all")[] = ["all", "eat", "do", "nightlife", "stay"];

/** Your list: rate places with one tap, rank them against each other, and keep a want-to-go list. */
export default function List() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "been" || params.get("tab") === "want" ? (params.get("tab") as Tab) : "rate";
  const { ranked, wantPlaces, logs } = useList();
  const { savedIds } = useListSaved();
  const [importOpen, setImportOpen] = useState<boolean>(false);

  const setTab = (t: Tab) => {
    params.set("tab", t);
    setParams(params, { replace: true });
  };

  const wantCount = savedIds.filter((id) => PLACE_BY_ID[id] && !logs.some((l) => l.id === id)).length + wantPlaces.length;
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "rate", label: "Rate places" },
    { id: "been", label: "Been", count: ranked.length },
    { id: "want", label: "Want to go", count: wantCount },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your list</p>
          <h1 className="mt-2 text-[48px] font-semibold leading-none text-secondary sm:text-[56px]">Where you've been</h1>
          <p className="mt-2 max-w-xl text-foreground/70">Tap how a place felt, answer a quick "which was better?", and it lands in your ranked list. Your ratings sharpen your matches and help other travelers.</p>
        </div>
        <button type="button" onClick={() => setImportOpen(true)} className="press inline-flex h-12 items-center gap-2 rounded-xl bg-secondary px-5 font-semibold text-secondary-foreground hover:bg-secondary/90">
          <ImagePlus className="size-[18px]" /> Import from photos
        </button>
      </header>

      <PlaceSearch className="mt-6 max-w-2xl" />

      <div role="tablist" aria-label="List sections" className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("relative -mb-px flex h-11 items-center gap-2 border-b-2 px-4 text-[15px] font-semibold transition-colors", tab === t.id ? "border-primary text-foreground" : "border-transparent text-foreground/55 hover:text-foreground")}
          >
            {t.label}
            {t.count ? <span className={cn("rounded-full px-1.5 text-[11px] font-bold", tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "rate" ? <RateStream onImport={() => setImportOpen(true)} /> : null}
      {tab === "been" ? <BeenList onRate={() => setTab("rate")} /> : null}
      {tab === "want" ? <WantList /> : null}

      <PhotoImport open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

/** Saved catalog ids live in TripsProvider; read them through the list context's isWant. */
function useListSaved() {
  const { isWant } = useList();
  const savedIds = useMemo(() => PLACES.filter((p) => isWant(p.id)).map((p) => p.id), [isWant]);
  return { savedIds };
}

function RateStream({ onImport }: { onImport: () => void }) {
  const { logFor, skipped, skipPlace, openRate, isWant, toggleWant, ranked, imported } = useList();
  const { profile } = useProfile();
  const [city, setCity] = useState<string>("all");
  const [kind, setKind] = useState<PlaceKind | "all">("all");

  const queue = useMemo(
    () =>
      PLACES.filter((p) => !logFor(p.id) && !skipped.includes(p.id) && (city === "all" || p.city === city) && (kind === "all" || p.kind === kind))
        .map((p) => ({ p, s: matchPlace(profile, p).score }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p),
    [logFor, skipped, city, kind, profile],
  );
  const pendingImports = imported.filter((i) => !logFor(i.place.id));
  const current = queue[0];
  const upNext = queue.slice(1, 4);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {pendingImports.length ? (
          <section className="mb-6 rounded-2xl border border-primary/30 bg-accent/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Camera className="size-4" /> From your photos · {pendingImports.length} to rate
            </p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {pendingImports.map((i) => (
                <button key={i.place.id} type="button" onClick={() => openRate(i.place, "tier", undefined, i.photo)} className="press w-36 shrink-0 overflow-hidden rounded-xl bg-card text-left shadow-sm">
                  <img src={i.photo ? photoSrc(i.photo) : placeImage(i.place)} alt="" className="aspect-square w-full object-cover" />
                  <p className="truncate px-2.5 py-2 text-[13px] font-semibold">{i.place.name}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {["all", ...CITIES.map((c) => c.name)].map((c) => (
            <button key={c} type="button" onClick={() => setCity(c)} aria-pressed={city === c} className={cn("rounded-full border px-3.5 py-1.5 text-sm", city === c ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
              {c === "all" ? "All cities" : c}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {KIND_FILTERS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("rounded-full border px-3 py-1.5 text-sm", kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
              {k === "all" ? "Everything" : KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {current ? (
          <QuickRateCard
            key={current.id}
            place={current}
            want={isWant(current.id)}
            onTier={(t) => openRate(current, "compare", t)}
            onSkip={() => skipPlace(current.id)}
            onWant={() => {
              if (!isWant(current.id)) toggleWant(current);
              skipPlace(current.id);
            }}
          />
        ) : (
          <div className="surface mt-5 p-10 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-display text-2xl font-semibold text-secondary">You've been through everything here</p>
            <p className="mt-1 text-muted-foreground">Search above for any place in the world, or pull places from your camera roll.</p>
            <button type="button" onClick={onImport} className="press mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
              <ImagePlus className="size-4" /> Import from photos
            </button>
          </div>
        )}

        {upNext.length ? (
          <div className="mt-5">
            <p className="eyebrow">Up next</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {upNext.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl bg-card opacity-80">
                  <img src={placeImage(p)} alt="" className="aspect-[16/10] w-full object-cover" />
                  <p className="truncate px-2.5 py-2 text-[12.5px] font-semibold">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="space-y-4">
        <ListSnapshot ranked={ranked} />
      </aside>
    </div>
  );
}

const QuickRateCard = memo(function QuickRateCard({ place, want, onTier, onSkip, onWant }: { place: Place; want: boolean; onTier: (t: ListTier) => void; onSkip: () => void; onWant: () => void }) {
  const { data: community } = useCommunityScores();
  const c = community?.[place.id];
  return (
    <article className="surface animate-rise mt-5 overflow-hidden">
      <div className="relative aspect-[16/9] bg-muted sm:aspect-[2/1]">
        <img src={placeImage(place)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F2A44]/85 via-transparent to-transparent" />
        <div className="absolute inset-x-5 bottom-4 text-white">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/75">{[KIND_LABEL[place.kind], place.city].join(" · ")}</p>
          <h2 className="mt-1 font-display text-[34px] font-semibold leading-tight">{place.name}</h2>
          <p className="text-[13.5px] text-white/80">{[place.cuisine, place.neighborhood, priceLabel(place.price)].filter(Boolean).join(" · ")}</p>
        </div>
        {c ? (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-secondary">
            <Users className="size-3.5" /> {c.avg.toFixed(1)} from {c.count}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        <p className="text-center text-[15px] font-semibold text-foreground/80">Been here? How was it?</p>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {TIERS.map((t) => {
            const Icon = TIER_ICON[t];
            return (
              <button key={t} type="button" onClick={() => onTier(t)} className="press group flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-white shadow-sm transition-transform hover:-translate-y-0.5" style={{ background: TIER_META[t].color }}>
                <Icon className="size-5 transition-transform group-hover:scale-110" />
                <span className="text-[14px] font-semibold">{TIER_META[t].label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onWant} className={cn("press flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold", want ? "border-primary/40 bg-accent text-primary" : "border-border hover:bg-muted")}>
            <Bookmark className={cn("size-4", want && "fill-primary")} /> Want to go
          </button>
          <button type="button" onClick={onSkip} className="press flex h-11 items-center justify-center gap-2 rounded-xl border border-border font-semibold text-foreground/70 hover:bg-muted">
            Haven't been <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
});

function ListSnapshot({ ranked }: { ranked: RankedLog[] }) {
  const counts = TIERS.map((t) => ({ t, n: ranked.filter((r) => r.log.tier === t).length }));
  const total = ranked.length;
  return (
    <div className="surface p-5">
      <p className="eyebrow">Your list so far</p>
      <p className="mt-2 font-display text-[52px] font-semibold leading-none text-secondary">{total}</p>
      <p className="text-sm text-muted-foreground">{total === 1 ? "place ranked" : "places ranked"}</p>
      {total ? (
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
          {counts.map(({ t, n }) => (n ? <span key={t} className="xp-bar h-full" style={{ width: `${(n / total) * 100}%`, background: TIER_META[t].color }} /> : null))}
        </div>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-sm">
        {counts.map(({ t, n }) => (
          <li key={t} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: TIER_META[t].color }} />
            {TIER_META[t].label}
            <span className="ml-auto font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
      {ranked.slice(0, 3).length ? (
        <div className="mt-4 border-t border-border/70 pt-3">
          <p className="eyebrow mb-2">Your top 3</p>
          {ranked.slice(0, 3).map((r) => (
            <p key={r.log.id} className="flex items-center gap-2 py-1 text-[13.5px]">
              <span className="font-display text-base font-semibold text-foreground/40">{r.rank}</span>
              <span className="truncate font-medium">{r.log.place.name}</span>
              <span className="ml-auto font-semibold tabular-nums" style={{ color: TIER_META[r.log.tier].color }}>
                {r.score.toFixed(1)}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BeenList({ onRate }: { onRate: () => void }) {
  const { ranked, openRate } = useList();
  const [filter, setFilter] = useState<ListTier | "all">("all");
  const [city, setCity] = useState<string>("all");
  const cities = useMemo(() => [...new Set(ranked.map((r) => r.log.place.city).filter(Boolean))], [ranked]);
  const rows = ranked.filter((r) => (filter === "all" || r.log.tier === filter) && (city === "all" || r.log.place.city === city));

  if (!ranked.length) {
    return (
      <div className="surface mt-6 p-10 text-center">
        <ListOrdered className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-display text-2xl font-semibold text-secondary">Nothing ranked yet</p>
        <p className="mt-1 text-muted-foreground">Rate a few places and they'll line up here, best first.</p>
        <button type="button" onClick={onRate} className="press mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
          Start rating
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...TIERS] as const).map((t) => (
          <button key={t} type="button" onClick={() => setFilter(t)} aria-pressed={filter === t} className={cn("rounded-full border px-3.5 py-1.5 text-sm", filter === t ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
            {t === "all" ? "All" : TIER_META[t].short}
          </button>
        ))}
        {cities.length > 1 ? (
          <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filter by city" className="ml-auto h-9 rounded-lg border border-border bg-card px-2 text-sm">
            <option value="all">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <ol className="mt-4 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
        {rows.map((r, i) => (
          <BeenRow key={r.log.id} r={r} index={i} onOpen={() => openRate(r.log.place, "details")} onRerank={() => openRate(r.log.place, "tier")} />
        ))}
      </ol>
    </div>
  );
}

const BeenRow = memo(function BeenRow({ r, index, onOpen, onRerank }: { r: RankedLog; index: number; onOpen: () => void; onRerank: () => void }) {
  const { log } = r;
  const color = TIER_META[log.tier].color;
  const sub = [log.place.cuisine ?? KIND_LABEL[log.place.kind], log.place.neighborhood, log.place.city].filter(Boolean).join(" · ");
  return (
    <li className="xp-rerank flex items-center gap-4 px-4 py-3.5" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <span className="w-7 shrink-0 text-right font-display text-[22px] font-semibold tabular-nums text-foreground/35">{r.rank}</span>
      <button type="button" onClick={onOpen} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
        <img src={log.photos[0] ? photoSrc(log.photos[0]) : placeImage(log.place)} alt="" className="h-full w-full object-cover" />
        {log.photos.length > 1 ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-bold text-white">+{log.photos.length - 1}</span> : null}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[15.5px] font-semibold">{log.place.name}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">{sub}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-foreground/70">
          {log.visitedOn ? <span>{visitLabel(log.visitedOn)}</span> : null}
          {log.favorites.length ? <span className="truncate">♥ {log.favorites.slice(0, 2).join(", ")}</span> : null}
          {log.with.length ? (
            <span className="inline-flex items-center gap-1">
              <PersonAvatar name={log.with[0]} className="size-4 text-[8px]" /> with {log.with.slice(0, 2).join(", ")}
            </span>
          ) : null}
          {log.postId ? <span className="text-[#3F8A63]">On the feed</span> : null}
        </p>
      </button>
      <button type="button" onClick={onRerank} aria-label={`Re-rank ${log.place.name}`} className="press grid size-14 shrink-0 place-items-center rounded-full border-[3px] font-display text-[19px] font-bold tabular-nums" style={{ borderColor: color, color }}>
        {r.score.toFixed(1)}
      </button>
    </li>
  );
});

function WantList() {
  const { isWant, toggleWant, wantPlaces, logFor, openRate } = useList();
  const { profile } = useProfile();
  const list = useMemo(() => [...wantPlaces, ...PLACES.filter((p) => isWant(p.id))].filter((p) => !logFor(p.id)), [wantPlaces, isWant, logFor]);

  if (!list.length) {
    return (
      <div className="surface mt-6 p-10 text-center">
        <Bookmark className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-display text-2xl font-semibold text-secondary">Nothing saved yet</p>
        <p className="mt-1 text-muted-foreground">Tap "Want to go" on any place, here or in the feed.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((p, i) => (
        <article key={p.id} className="surface animate-rise overflow-hidden" style={{ animationDelay: `${Math.min(i, 9) * 50}ms` }}>
          <div className="relative aspect-[16/10] bg-muted">
            <img src={placeImage(p)} alt="" loading="lazy" className="h-full w-full object-cover" />
            {!p.custom ? <span className="match-pill absolute right-3 top-3">{matchPlace(profile, p).score}%</span> : null}
          </div>
          <div className="p-4">
            <p className="truncate text-[16px] font-semibold">{p.name}</p>
            <p className="truncate text-[12.5px] text-muted-foreground">{[KIND_LABEL[p.kind], p.neighborhood, p.city].filter(Boolean).join(" · ")}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => openRate(p)} className="press h-9 flex-1 rounded-lg bg-secondary text-[13px] font-semibold text-secondary-foreground">
                I've been, rate it
              </button>
              <button type="button" onClick={() => toggleWant(p)} aria-label={`Remove ${p.name}`} className="press grid size-9 place-items-center rounded-lg border border-primary/40 bg-accent text-primary">
                <Bookmark className="size-4 fill-primary" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
