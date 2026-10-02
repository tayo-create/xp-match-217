import { ArrowRight, Eye, EyeOff, Heart, Loader2, RotateCcw, Share2, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { BlendDonut } from "@/components/xp/BlendDonut";
import { CategoryBars } from "@/components/xp/CategoryBars";
import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { StyleDialsCard } from "@/components/xp/StyleDialsCard";
import { TravelerCard } from "@/components/xp/TravelerCard";
import { TRAVELER_TYPES, tagLabel } from "@/data/travelerTypes";
import { dominantType, sortedTypes } from "@/lib/match";
import { cn } from "@/lib/utils";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";

type Filter = "all" | "soon" | "saved";

/** Your Taste Profile + real travelers you'll vibe with. */
export default function Travelers() {
  const { profile, hasProfile } = useProfile();
  const { isSignedIn, travelerMatches, savedTravelers, directoryLoading, directoryError, card, setCard, isListed } = useSocial();
  const [showAll, setShowAll] = useState<boolean>(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingCard, setEditingCard] = useState<boolean>(false);
  const top = TRAVELER_TYPES[dominantType(profile.blend)];
  const order = sortedTypes(profile.blend);

  const list = useMemo(() => {
    const f = travelerMatches.filter(({ traveler }) => (filter === "saved" ? savedTravelers.includes(traveler.id) : filter === "soon" ? Boolean(traveler.upcoming) : true));
    return showAll ? f : f.slice(0, 6);
  }, [travelerMatches, filter, savedTravelers, showAll]);

  const share = async () => {
    const text = `My XP Match Taste Profile: ${order.map((t) => `${profile.blend[t]}% ${TRAVELER_TYPES[t].short}`).join(" · ")}. Find yours at xpmatchme.com`;
    try {
      if (navigator.share) await navigator.share({ title: "My Taste Profile", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Profile copied to clipboard");
      }
    } catch {
      /* user cancelled share */
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-8 sm:px-8">
      {!hasProfile ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-accent px-5 py-3.5 text-[15px]">
          <span className="flex-1">This is a sample profile. Build your own to get matches that are truly yours.</span>
          <Link to="/welcome" className="font-semibold text-primary hover:underline">
            Build my Taste Profile →
          </Link>
        </div>
      ) : null}

      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="animate-rise">
          <p className="eyebrow">Your Taste Profile</p>
          <h1 className="mt-3 text-[52px] font-semibold leading-[1.02] text-secondary sm:text-[60px]">Primarily {top.name.replace("The ", "a ")}</h1>
          <p className="mt-3 text-[19px] text-foreground/85">{order.map((t) => `${profile.blend[t]}% ${TRAVELER_TYPES[t].short}`).join(" · ")}</p>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-foreground/80">{profile.summary}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={share} className="press inline-flex h-[52px] items-center gap-2.5 rounded-xl bg-primary px-6 text-[16px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Share2 className="size-[18px]" /> Share profile
            </button>
            <Link to="/welcome" className="press inline-flex h-[52px] items-center gap-2 rounded-xl border border-border px-5 font-medium hover:bg-muted">
              <RotateCcw className="size-4" /> Retake
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-8 animate-rise sm:flex-row" style={{ animationDelay: "120ms" }}>
          <BlendDonut blend={profile.blend} size={230} thickness={40} />
          <ul className="space-y-5">
            {order.map((t) => (
              <li key={t} className="grid grid-cols-[14px_110px_1fr] gap-x-3">
                <span className="mt-1.5 size-3 rounded-full" style={{ background: TRAVELER_TYPES[t].color }} />
                <span className="font-semibold">
                  {profile.blend[t]}% {TRAVELER_TYPES[t].short}
                </span>
                <span className="text-[14px] leading-snug text-foreground/75">{TRAVELER_TYPES[t].description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 grid gap-8 border-t border-border pt-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="eyebrow mb-5">Your travel preferences</p>
          <CategoryBars categories={profile.categories} />
          {profile.likes.length ? (
            <p className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px]">
              <Heart className="size-5 fill-primary text-primary" />
              Loves {(profile.loves?.length ? profile.loves : profile.likes).slice(0, 5).map(tagLabel).join(" · ")}
            </p>
          ) : null}
        </div>
        <StyleDialsCard />
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Travelers you'll vibe with</p>
            <p className="mt-1 text-sm text-muted-foreground">Real people on XP Match, ranked by how closely their taste matches yours.</p>
          </div>
          {isSignedIn ? (
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "soon", "saved"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm", filter === f ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}
                >
                  {f === "all" ? "All" : f === "soon" ? "Traveling soon" : "Saved"}
                </button>
              ))}
              {travelerMatches.length > 6 ? (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {showAll ? "Show fewer" : "See all"} <ArrowRight className="size-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isSignedIn ? (
          <SignInPrompt className="mt-6" title="Meet travelers like you" body="Sign in to see real people with a similar Taste Profile, message them and compare trips." />
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              {isListed ? <Eye className="size-4 text-[#3F8A63]" /> : <EyeOff className="size-4 text-muted-foreground" />}
              <p className="min-w-0 flex-1 text-sm">
                {isListed ? (
                  <>
                    <span className="font-semibold">You're listed.</span> <span className="text-muted-foreground">Other travelers can find and message you.</span>
                  </>
                ) : hasProfile ? (
                  <>
                    <span className="font-semibold">You're hidden.</span> <span className="text-muted-foreground">Nobody can find you in the directory.</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Build your Taste Profile to appear in the directory.</span>
                )}
              </p>
              <button type="button" onClick={() => setEditingCard((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-muted">
                <SlidersHorizontal className="size-4" /> Edit my card
              </button>
              {hasProfile ? (
                <button type="button" onClick={() => setCard((c) => ({ ...c, discoverable: !c.discoverable }))} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
                  {card.discoverable ? "Hide me" : "List me"}
                </button>
              ) : null}
            </div>
            {editingCard ? (
              <div className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
                <label className="block text-sm">
                  <span className="font-semibold">Home city</span>
                  <input value={card.home} onChange={(e) => setCard((c) => ({ ...c, home: e.target.value.slice(0, 60) }))} placeholder="e.g. London" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 outline-none focus:border-primary" />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold">A line about you</span>
                  <input value={card.bio} onChange={(e) => setCard((c) => ({ ...c, bio: e.target.value.slice(0, 280) }))} placeholder="Food lover, museum hopper, always down for a long walk." className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 outline-none focus:border-primary" />
                </label>
              </div>
            ) : null}

            {directoryLoading ? (
              <Loader2 className="mt-8 size-6 animate-spin text-primary" aria-label="Loading travelers" />
            ) : directoryError ? (
              <p className="mt-6 text-destructive">{directoryError}</p>
            ) : list.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                <p className="font-display text-2xl text-secondary">{filter === "all" ? "You're early" : "Nobody here yet"}</p>
                <p className="mx-auto mt-1 max-w-md text-muted-foreground">
                  {filter === "all" ? "No other travelers are listed yet. Invite a friend to a trip, and once they build a Taste Profile they'll show up here." : "Try another filter."}
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {list.map(({ traveler, score }, i) => (
                  <TravelerCard key={traveler.id} traveler={traveler} score={score} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
