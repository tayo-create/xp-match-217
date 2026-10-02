import { ArrowRight, Compass, Crown, Scale, Sparkles, UserPlus } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AddToTripButton } from "@/components/xp/AddToTrip";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { TwinBars, WhyBadge } from "@/components/xp/ScoreBreakdown";
import { INTEREST_BY_ID } from "@/data/interests";
import { CITIES, KIND_LABEL, PLACES, placeImage, priceLabel } from "@/data/places";
import { type PlaceScores, type TripPerson, scoreForPeople, useTripPeople } from "@/hooks/use-trip-people";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";
import type { ConciergeChat, Place, PlaceKind } from "@/lib/types";
import { useConcierge } from "@/providers/ConciergeProvider";
import { formatRange, useTrips } from "@/providers/TripsProvider";

/** "group" ranks by the fairness rule; otherwise a person's id ranks by their score alone. */
type Perspective = "group" | string;

interface Ranked {
  place: Place;
  scores: PlaceScores;
  value: number;
}

const valueFor = (s: PlaceScores, perspective: Perspective): number =>
  perspective === "group" ? s.group : (s.per.find((p) => p.person.id === perspective)?.score.score ?? s.group);

const KIND_FILTERS: (PlaceKind | "all")[] = ["all", "eat", "do", "nightlife", "stay", "move"];

/** Per-trip discovery: one switch re-ranks the podium, For You, Explore and the trip summary for any person or the whole group. */
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const { chats } = useConcierge();
  const { tripById } = useTrips();
  const tripChats = useMemo(() => chats.filter((c) => c.tripId && tripById(c.tripId)), [chats, tripById]);
  const chat = tripChats.find((c) => c.id === params.get("chat")) ?? tripChats[0];
  const trip = tripById(chat?.tripId);
  const people = useTripPeople(chat);
  const isGroup = people.length > 1;
  const [perspective, setPerspective] = useState<Perspective>("group");
  const [kind, setKind] = useState<PlaceKind | "all">("all");
  const active: Perspective = isGroup ? (perspective === "group" || people.some((p) => p.id === perspective) ? perspective : "group") : (people[0]?.id ?? "group");

  const city = trip?.city ?? CITIES[0].name;
  const inTrip = useMemo(() => new Set(trip?.days.flatMap((d) => d.items.map((x) => x.place.id)) ?? []), [trip]);

  const scored = useMemo(() => PLACES.filter((p) => p.city === city).map((place) => ({ place, scores: scoreForPeople(people, place) })), [people, city]);

  const ranked = useMemo<Ranked[]>(
    () => scored.map((s) => ({ ...s, value: valueFor(s.scores, active) })).sort((a, b) => b.value - a.value),
    [scored, active],
  );

  const podium = ranked.filter((r) => !inTrip.has(r.place.id)).slice(0, 3);
  const interestKinds = useMemo(() => new Set((chat?.settings?.interests ?? []).flatMap((i) => INTEREST_BY_ID[i]?.kinds ?? [])), [chat?.settings]);
  const forYou = useMemo(() => {
    const pool = ranked.filter((r) => !inTrip.has(r.place.id) && !podium.some((p) => p.place.id === r.place.id));
    const focused = interestKinds.size ? pool.filter((r) => interestKinds.has(r.place.kind)) : pool;
    return (focused.length >= 4 ? focused : pool).slice(0, 8);
  }, [ranked, inTrip, podium, interestKinds]);
  const explore = useMemo(() => ranked.filter((r) => kind === "all" || r.place.kind === kind), [ranked, kind]);
  const disagreements = useMemo(() => (isGroup ? [...scored].sort((a, b) => b.scores.spread - a.scores.spread).filter((s) => s.scores.spread >= 30).slice(0, 3) : []), [scored, isGroup]);

  const summary = useMemo(() => {
    const items = trip?.days.flatMap((d) => d.items) ?? [];
    const rows = items.map((it) => scoreForPeople(people, it.place));
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + valueFor(r, active), 0) / rows.length) : 0;
    const perPerson = people.map((person) => ({
      person,
      avg: rows.length ? Math.round(rows.reduce((s, r) => s + (r.per.find((p) => p.person.id === person.id)?.score.score ?? 0), 0) / rows.length) : 0,
    }));
    const split = rows.filter((r) => r.spread >= 30).length;
    const weakest = items.map((it, i) => ({ it, v: rows[i] ? valueFor(rows[i], active) : 0 })).sort((a, b) => a.v - b.v)[0];
    return { count: items.length, avg, perPerson, split, weakest };
  }, [trip, people, active]);

  const label = (p: Perspective): string => (p === "group" ? (people.length > 2 ? "Everyone" : "Both") : people.find((x) => x.id === p)?.isMe ? "You" : firstName(people.find((x) => x.id === p)?.name ?? ""));
  const rerankKey = `${active}-${kind}`;

  if (!chat || !trip) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <Compass className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-4xl font-semibold text-secondary">Start a trip to discover</h1>
        <p className="mt-2 text-muted-foreground">Discover ranks every place in your trip's city for you, or for everyone on the trip.</p>
        <Link to="/" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
          Plan a trip <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-7 sm:px-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Discover</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="text-[48px] font-semibold leading-none text-secondary sm:text-[56px]">{city}</h1>
            {tripChats.length > 1 ? (
              <select
                value={chat.id}
                onChange={(e) => {
                  params.set("chat", e.target.value);
                  setParams(params, { replace: true });
                }}
                aria-label="Choose trip"
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-medium"
              >
                {tripChats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <p className="mt-2 text-foreground/70">
            {formatRange(trip.startDate, trip.endDate)} · ranked {isGroup ? `for ${people.map((p) => (p.isMe ? "you" : firstName(p.name))).join(", ")}` : "for your taste"}
          </p>
        </div>
        {isGroup ? (
          <PerspectiveSwitch people={people} value={active} onChange={setPerspective} label={label} />
        ) : (
          <Link to={`/c/${chat.id}`} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-primary/50 px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent">
            <UserPlus className="size-4" /> Invite someone to compare scores
          </Link>
        )}
      </header>

      {isGroup && active === "group" ? (
        <p className="mt-4 flex items-center gap-2 text-[13.5px] text-foreground/70">
          <Scale className="size-4 text-primary" /> Group score = half the average, half the lowest. A place one of you rates 95 and another 10 lands around 31.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-label="Top matches">
          <h2 className="text-[28px] font-semibold text-secondary">Top matches</h2>
          <div key={rerankKey} className="mt-4 grid items-end gap-4 sm:grid-cols-3">
            {[1, 0, 2].map((rank) => {
              const r = podium[rank];
              if (!r) return <div key={rank} className="hidden sm:block" />;
              return <PodiumCard key={r.place.id} rank={rank} r={r} tripId={trip.id} showBars={isGroup && active === "group"} />;
            })}
          </div>
        </section>
        <TripSummary chat={chat} summary={summary} isGroup={isGroup} perspectiveLabel={label(active)} />
      </div>

      <section className="mt-12" aria-label="For you">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[28px] font-semibold text-secondary">For {label(active) === "You" ? "you" : label(active) === "Both" || label(active) === "Everyone" ? "all of you" : label(active)}</h2>
          {interestKinds.size ? <span className="text-sm text-muted-foreground">Leaning into this trip's focus</span> : null}
        </div>
        <div key={rerankKey} className="-mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 scrollbar-thin sm:-mx-8 sm:px-8">
          {forYou.map((r, i) => (
            <FeedCard key={r.place.id} r={r} index={i} tripId={trip.id} showBars={isGroup && active === "group"} />
          ))}
        </div>
      </section>

      {disagreements.length ? (
        <section className="mt-10 rounded-2xl border border-[#D9A43A]/40 bg-[#D9A43A]/[0.07] p-5 sm:p-6">
          <h2 className="text-[22px] font-semibold text-secondary">Where you disagree</h2>
          <p className="text-sm text-muted-foreground">Big gaps between you. Good to talk through before booking.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {disagreements.map((d) => (
              <li key={d.place.id} className="flex gap-3 rounded-xl bg-card p-3">
                <img src={placeImage(d.place)} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.place.name}</p>
                  <TwinBars scores={d.scores} compact className="mt-1.5" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12" aria-label="Explore">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[28px] font-semibold text-secondary">Explore {city}</h2>
          <div className="flex flex-wrap gap-1.5">
            {KIND_FILTERS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("rounded-full border px-3.5 py-1.5 text-sm", kind === k ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
                {k === "all" ? "All" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <ol key={rerankKey} className="mt-4 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {explore.map((r, i) => (
            <ExploreRow key={r.place.id} r={r} rank={i + 1} index={i} tripId={trip.id} inTrip={inTrip.has(r.place.id)} showBars={isGroup && active === "group"} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function PerspectiveSwitch({ people, value, onChange, label }: { people: TripPerson[]; value: Perspective; onChange: (p: Perspective) => void; label: (p: Perspective) => string }) {
  const options: Perspective[] = [...people.map((p) => p.id), "group"];
  return (
    <div role="radiogroup" aria-label="Rank for" className="flex gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
      {options.map((o) => {
        const person = people.find((p) => p.id === o);
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={cn("press inline-flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-semibold transition-colors", o === "group" && "pl-4", on ? "bg-secondary text-secondary-foreground" : "text-foreground/70 hover:bg-muted")}
          >
            {person ? <PersonAvatar name={person.name} src={person.avatar} className="size-7 text-xs" /> : null}
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

const MEDAL = ["#C8452D", "#1F2A44", "#D9A43A"];
const HEIGHT = ["sm:pt-0", "sm:pt-10", "sm:pt-16"];

const PodiumCard = memo(function PodiumCard({ rank, r, tripId, showBars }: { rank: number; r: Ranked; tripId: string; showBars: boolean }) {
  return (
    <article className={cn("xp-rerank", HEIGHT[rank])} style={{ animationDelay: `${rank * 80}ms` }}>
      <div className="surface overflow-hidden">
        <div className="relative aspect-[4/3] bg-muted">
          <img src={placeImage(r.place)} alt="" className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 grid size-9 place-items-center rounded-full font-display text-lg font-bold text-white shadow" style={{ background: MEDAL[rank] }}>
            {rank === 0 ? <Crown className="size-4" /> : rank + 1}
          </span>
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <WhyBadge scores={r.scores} />
            <span className="match-pill px-3 py-1.5 text-[14px]">{r.value}%</span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-sans text-[17px] font-semibold leading-snug">{r.place.name}</h3>
          <p className="text-[13px] text-muted-foreground">{[r.place.cuisine ?? KIND_LABEL[r.place.kind], r.place.neighborhood, priceLabel(r.place.price)].join(" · ")}</p>
          {showBars ? <TwinBars scores={r.scores} className="mt-3" /> : <p className="mt-2 line-clamp-2 text-[13px] text-foreground/75">{r.scores.per[0]?.score.reasons[0]}</p>}
          <div className="mt-3">
            <AddToTripButton place={r.place} preferredTripId={tripId} size="sm" />
          </div>
        </div>
      </div>
    </article>
  );
});

const FeedCard = memo(function FeedCard({ r, index, tripId, showBars }: { r: Ranked; index: number; tripId: string; showBars: boolean }) {
  return (
    <article className="surface xp-rerank w-[260px] shrink-0 snap-start overflow-hidden" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="relative aspect-[16/10] bg-muted">
        <img src={placeImage(r.place)} alt="" loading="lazy" className="h-full w-full object-cover" />
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
          <WhyBadge scores={r.scores} />
          <span className="match-pill px-2.5 py-1 text-[12.5px]">{r.value}%</span>
        </div>
      </div>
      <div className="p-3.5">
        <h3 className="truncate font-sans text-[15.5px] font-semibold">{r.place.name}</h3>
        <p className="truncate text-[12.5px] text-muted-foreground">{[KIND_LABEL[r.place.kind], r.place.neighborhood].join(" · ")}</p>
        {showBars ? <TwinBars scores={r.scores} compact className="mt-2.5" /> : <p className="mt-2 line-clamp-2 text-[12.5px] text-foreground/75">{r.scores.per[0]?.score.reasons.join(" · ")}</p>}
        <div className="mt-3">
          <AddToTripButton place={r.place} preferredTripId={tripId} size="sm" />
        </div>
      </div>
    </article>
  );
});

const ExploreRow = memo(function ExploreRow({ r, rank, index, tripId, inTrip, showBars }: { r: Ranked; rank: number; index: number; tripId: string; inTrip: boolean; showBars: boolean }) {
  return (
    <li className="xp-rerank flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <span className="w-6 shrink-0 text-right font-display text-xl font-semibold tabular-nums text-foreground/40">{rank}</span>
      <img src={placeImage(r.place)} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold">
          {r.place.name}
          {inTrip ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">On your trip</span> : null}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">{[r.place.cuisine ?? KIND_LABEL[r.place.kind], r.place.neighborhood, priceLabel(r.place.price)].join(" · ")}</p>
      </div>
      {showBars ? <TwinBars scores={r.scores} compact className="w-full sm:w-56" /> : null}
      <div className="flex items-center gap-1.5">
        <WhyBadge scores={r.scores} className="border border-border" />
        <span className="match-pill w-14 justify-center py-1 text-[13px]">{r.value}%</span>
      </div>
      {!inTrip ? <AddToTripButton place={r.place} preferredTripId={tripId} size="sm" className="flex-none" /> : null}
    </li>
  );
});

function TripSummary({
  chat,
  summary,
  isGroup,
  perspectiveLabel,
}: {
  chat: ConciergeChat;
  summary: { count: number; avg: number; perPerson: { person: TripPerson; avg: number }[]; split: number; weakest?: { it: { place: Place }; v: number } };
  isGroup: boolean;
  perspectiveLabel: string;
}) {
  return (
    <aside className="surface h-fit p-5 lg:sticky lg:top-6">
      <p className="eyebrow">Trip summary</p>
      {summary.count === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No stops yet. Add from the podium or ask XP.</p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-3">
            <span key={summary.avg} className="xp-rerank font-display text-[56px] font-semibold leading-none text-secondary">{summary.avg}</span>
            <span className="pb-1.5 text-sm text-muted-foreground">
              avg fit for {perspectiveLabel === "You" ? "you" : perspectiveLabel === "Both" || perspectiveLabel === "Everyone" ? "the group" : perspectiveLabel}
              <br />
              across {summary.count} stops
            </span>
          </div>
          {isGroup ? (
            <div className="mt-4 space-y-2">
              {summary.perPerson.map(({ person, avg }) => (
                <div key={person.id} className="grid grid-cols-[72px_1fr_28px] items-center gap-2 text-[12.5px]">
                  <span className="truncate font-semibold" style={{ color: person.color }}>
                    {person.isMe ? "You" : firstName(person.name)}
                  </span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-muted">
                    <span className="xp-bar absolute inset-y-0 left-0 rounded-full" style={{ width: `${avg}%`, background: person.color }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{avg}</span>
                </div>
              ))}
            </div>
          ) : null}
          {isGroup && summary.split ? <p className="mt-3 text-[13px] font-medium text-[#B7791F]">{summary.split} {summary.split === 1 ? "stop splits" : "stops split"} the group</p> : null}
          {summary.weakest && summary.weakest.v < 55 ? (
            <p className="mt-3 text-[13px] text-foreground/75">
              Weakest fit: <span className="font-semibold">{summary.weakest.it.place.name}</span> ({summary.weakest.v})
            </p>
          ) : null}
        </>
      )}
      <Link to={`/c/${chat.id}`} className="press mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <Sparkles className="size-4" /> Ask XP to improve it
      </Link>
      <Link to={`/trips/${chat.tripId}`} className="mt-2 flex h-10 items-center justify-center text-sm font-semibold text-primary hover:underline">
        Open itinerary
      </Link>
    </aside>
  );
}
