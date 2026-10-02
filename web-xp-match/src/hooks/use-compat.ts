import { useCallback, useMemo } from "react";

import { useFeed } from "@/hooks/use-feed";
import { type Compatibility, type RatingOverlap, compatibility } from "@/lib/compat";
import { asProfile } from "@/lib/sharedProfile";
import type { TasteProfile } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useList } from "@/providers/ListProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";

interface Poster {
  profile?: TasteProfile;
  ratings: Map<string, { score: number; name: string }>;
}

/**
 * Taste compatibility between me and everyone who posted on the feed. Uses the taste snapshot on
 * their newest post (or their directory profile), plus how closely we rated the same places.
 */
export function useCompatibility() {
  const { data: posts } = useFeed();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { ranked } = useList();
  const { travelerById } = useSocial();

  const posters = useMemo(() => {
    const out = new Map<string, Poster>();
    // Posts arrive newest first, so the first taste / rating we see per person is the latest.
    for (const p of posts ?? []) {
      if (p.userId === user?.id) continue;
      const rec: Poster = out.get(p.userId) ?? { ratings: new Map<string, { score: number; name: string }>() };
      if (!rec.profile && p.taste) rec.profile = asProfile(p.taste, p.name);
      if (p.type === "log" && p.place && typeof p.score === "number" && !rec.ratings.has(p.place.id)) rec.ratings.set(p.place.id, { score: p.score, name: p.place.name });
      out.set(p.userId, rec);
    }
    return out;
  }, [posts, user?.id]);

  const byUser = useMemo(() => {
    const mine = new Map(ranked.map((r) => [r.log.id, r.score]));
    const out = new Map<string, Compatibility>();
    posters.forEach((rec, userId) => {
      const overlaps: RatingOverlap[] = [];
      rec.ratings.forEach((r, placeId) => {
        const m = mine.get(placeId);
        if (m !== undefined) overlaps.push({ placeId, name: r.name, mine: m, theirs: r.score });
      });
      const c = compatibility(profile, rec.profile ?? travelerById(userId)?.profile, overlaps);
      if (c) out.set(userId, c);
    });
    return out;
  }, [posters, ranked, profile, travelerById]);

  const compatFor = useCallback((userId: string) => byUser.get(userId), [byUser]);
  return { compatFor };
}
