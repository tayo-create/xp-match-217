import { useMemo } from "react";

import { applyTripSettings } from "@/data/interests";
import { groupScore, scorePlace, type PersonScore } from "@/lib/match";
import type { ConciergeChat, Place, TasteProfile } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCollab } from "@/providers/CollabProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

/** Someone whose taste counts on a trip: me plus every member who shared a profile. */
export interface TripPerson {
  id: string;
  name: string;
  avatar: string;
  profile: TasteProfile;
  isMe: boolean;
  online: boolean;
  color: string;
}

export const PERSON_COLORS = ["#C8452D", "#1F2A44", "#5E9C7C", "#D9A43A", "#4A6FA5", "#E08A6A"];

export interface PlaceScores {
  group: number;
  per: { person: TripPerson; score: PersonScore }[];
  /** Highest minus lowest individual score. */
  spread: number;
}

/** Scores a place for every person and for the group (half average, half lowest). */
export const scoreForPeople = (people: TripPerson[], place: Place): PlaceScores => {
  const per = people.map((person) => ({ person, score: scorePlace(person.profile, place) }));
  const values = per.map((p) => p.score.score);
  return { per, group: groupScore(values), spread: values.length > 1 ? Math.max(...values) - Math.min(...values) : 0 };
};

/** The people on a trip chat, each with this trip's focus folded into their Taste Profile. */
export function useTripPeople(chat: ConciergeChat | undefined): TripPerson[] {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { me } = useTrips();
  const { metaFor, onlineFor } = useCollab();
  const meta = metaFor(chat?.roomId);
  const onlineIds = onlineFor(chat?.roomId);
  const settings = chat?.settings;

  return useMemo(() => {
    const online = new Set(onlineIds);
    const mine: TripPerson = { id: me.id, name: profile.name, avatar: user?.picture ?? "", profile: applyTripSettings(profile, settings), isMe: true, online: true, color: PERSON_COLORS[0] };
    const others = (meta?.members ?? [])
      .filter((m) => m.userId !== me.id && m.profile)
      .map<TripPerson>((m, i) => ({
        id: m.userId,
        name: m.name,
        avatar: m.avatar,
        profile: applyTripSettings(m.profile as TasteProfile, settings),
        isMe: false,
        online: online.has(m.userId),
        color: PERSON_COLORS[(i + 1) % PERSON_COLORS.length],
      }));
    return [mine, ...others];
  }, [meta, onlineIds, me.id, profile, user?.picture, settings]);
}
