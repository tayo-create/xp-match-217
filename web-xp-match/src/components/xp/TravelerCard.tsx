import { Bookmark, CalendarDays, MapPin, MessageCircle } from "lucide-react";
import { memo } from "react";
import { Link, useNavigate } from "react-router-dom";

import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { tagLabel } from "@/data/travelerTypes";
import { blendLabel, sharedLikes } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { Traveler } from "@/lib/types";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";

/** A real traveler's card: photo, match %, shared tastes, Message and save. */
export const TravelerCard = memo(function TravelerCard({ traveler, score, index = 0 }: { traveler: Traveler; score: number; index?: number }) {
  const { profile } = useProfile();
  const { savedTravelers, toggleSavedTraveler } = useSocial();
  const navigate = useNavigate();
  const saved = savedTravelers.includes(traveler.id);
  const both = sharedLikes(profile.likes, traveler.likes).slice(0, 3);
  const to = `/travelers/${encodeURIComponent(traveler.id)}`;

  return (
    <article className="surface group flex flex-col p-5 animate-rise" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-start gap-4">
        <Link to={to} aria-label={`View ${traveler.name}'s profile`}>
          <PersonAvatar name={traveler.name} src={traveler.avatar} className="size-16 text-2xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={to} className="hover:underline">
            <h3 className="truncate text-[24px] font-semibold leading-tight text-secondary">{traveler.name}</h3>
          </Link>
          <p className="text-[13px] text-muted-foreground">{blendLabel(traveler.blend)} blend</p>
        </div>
        <span className="match-pill shrink-0 px-3 py-1.5 text-[14px]">{score}%</span>
      </div>
      {traveler.bio ? <p className="mt-3 line-clamp-2 text-[14.5px] leading-snug text-foreground/80">{traveler.bio}</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        {traveler.home ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {traveler.home}
          </span>
        ) : null}
        {traveler.upcoming ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {traveler.upcoming}
          </span>
        ) : null}
      </div>
      {both.length ? <p className="mt-2 text-xs font-medium text-primary">Both love {both.map(tagLabel).join(", ").toLowerCase()}</p> : null}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <button type="button" onClick={() => navigate(`/messages/${encodeURIComponent(traveler.id)}`)} className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/70 font-medium text-primary hover:bg-accent">
          <MessageCircle className="size-[18px]" /> Message
        </button>
        <button
          type="button"
          onClick={() => toggleSavedTraveler(traveler.id)}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${traveler.name}` : `Save ${traveler.name}`}
          className={cn("press grid size-11 place-items-center rounded-xl", saved ? "bg-accent text-primary" : "bg-muted text-foreground/70 hover:bg-muted/70")}
        >
          <Bookmark className={cn("size-[18px]", saved && "fill-primary")} />
        </button>
      </div>
    </article>
  );
});
