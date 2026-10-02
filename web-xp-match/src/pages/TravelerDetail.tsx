import { ArrowLeft, Bookmark, CalendarDays, MapPin, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BlendDonut, BlendLegend } from "@/components/xp/BlendDonut";
import { CategoryBars } from "@/components/xp/CategoryBars";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { PlaceCard } from "@/components/xp/PlaceCard";
import { PLACE_BY_ID } from "@/data/places";
import { TRAVELER_TYPES, tagLabel } from "@/data/travelerTypes";
import { firstName } from "@/lib/sharedProfile";
import { blendLabel, sharedLikes } from "@/lib/match";
import { cn } from "@/lib/utils";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";
import { useTrips } from "@/providers/TripsProvider";

/** A matched traveler's profile: blend, why you match, and their saved places. */
export default function TravelerDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useProfile();
  const { myPlaceIds } = useTrips();
  const { savedTravelers, toggleSavedTraveler, travelerById, matchFor, directoryLoading } = useSocial();
  const t = travelerById(id);
  const navigate = useNavigate();

  const saves = useMemo(() => (t ? t.savedPlaceIds.map((p) => PLACE_BY_ID[p]).filter(Boolean) : []), [t]);
  const overlap = useMemo(() => saves.filter((p) => myPlaceIds.has(p.id)), [saves, myPlaceIds]);
  const fresh = useMemo(() => saves.filter((p) => !myPlaceIds.has(p.id)), [saves, myPlaceIds]);

  if (!t) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="font-display text-4xl text-secondary">{directoryLoading ? "Loading…" : "Traveler not found"}</p>
        <Link to="/travelers" className="mt-4 inline-block font-medium text-primary">Back to travelers</Link>
      </div>
    );
  }

  const score = matchFor(t.id);
  const both = sharedLikes(profile.likes, t.likes);
  const saved = savedTravelers.includes(t.id);
  const first = firstName(t.name);

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-7 sm:px-8">
      <Link to="/travelers" className="inline-flex items-center gap-2 text-[15px] text-foreground/75 hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to travelers
      </Link>

      <section className="mt-5 grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="surface overflow-hidden animate-rise">
          {t.avatar ? (
            <img src={t.avatar} alt={t.name} referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center bg-muted">
              <PersonAvatar name={t.name} className="size-40 text-6xl" />
            </div>
          )}
          <div className="p-6">
            <h1 className="text-4xl font-semibold text-secondary">{t.name}</h1>
            <p className="mt-1 text-lg font-medium text-primary">{score}% match</p>
            {t.home ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" /> {t.home}</p> : null}
            {t.upcoming ? <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" /> {t.upcoming}</p> : null}
            <p className="mt-4 text-[15px] leading-relaxed">{t.bio}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => navigate(`/messages/${encodeURIComponent(t.id)}`)} className="press inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
                <MessageCircle className="size-[18px]" /> Message {first}
              </button>
              <button type="button" onClick={() => toggleSavedTraveler(t.id)} aria-pressed={saved} aria-label={saved ? "Unsave traveler" : "Save traveler"} className={cn("press grid size-12 place-items-center rounded-xl border", saved ? "border-primary/40 bg-accent text-primary" : "border-border hover:bg-muted")}>
                <Bookmark className={cn("size-5", saved && "fill-primary")} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface grid gap-6 p-6 animate-rise sm:grid-cols-[auto_1fr] sm:items-center sm:p-8" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center gap-6">
              <BlendDonut blend={t.blend} size={170} thickness={28} label={`${first}'s style`} />
              <BlendLegend blend={t.blend} />
            </div>
            <div className="sm:border-l sm:border-border sm:pl-8">
              <p className="eyebrow">Why you match</p>
              <p className="mt-3 text-[16px] leading-relaxed">
                You're both <span className="font-semibold">{blendLabel(profile.blend) === blendLabel(t.blend) ? blendLabel(t.blend) : `${TRAVELER_TYPES[(Object.keys(t.blend) as (keyof typeof t.blend)[]).sort((a, b) => t.blend[b] - t.blend[a])[0]].short}-leaning`}</span> travelers
                {both.length ? <> who love {both.slice(0, 4).map(tagLabel).join(", ")}</> : null}.
                {overlap.length ? <> You've already picked {overlap.length} of the same places.</> : null}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Matching blends your traveler-type mix, shared tastes, and how much you each care about eating, doing, staying and getting around.</p>
            </div>
          </div>

          <div className="surface p-6 animate-rise sm:p-8" style={{ animationDelay: "140ms" }}>
            <p className="eyebrow mb-5">{first}'s travel coefficients</p>
            <CategoryBars categories={t.categories} compact />
          </div>
        </div>
      </section>

      {overlap.length ? (
        <section className="mt-10">
          <h2 className="text-3xl font-semibold text-secondary">On both your lists</h2>
          <p className="mt-1 text-muted-foreground">Places you and {first} both saved or planned.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {overlap.map((p, i) => <PlaceCard key={p.id} place={p} index={i} />)}
          </div>
        </section>
      ) : null}

      {fresh.length ? (
        <section className="mt-10">
          <h2 className="text-3xl font-semibold text-secondary">{first} recommends</h2>
          <p className="mt-1 text-muted-foreground">Saved by {first}, scored against your own Taste Profile.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {fresh.map((p, i) => <PlaceCard key={p.id} place={p} index={i} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
