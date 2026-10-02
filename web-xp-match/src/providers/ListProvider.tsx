import createContextHook from "@nkzw/create-context-hook";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { COMMUNITY_KEY, FEED_KEY } from "@/hooks/use-feed";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { tasteSnapshot } from "@/lib/compat";
import { type FeedPost, toSnap, tripToSnap } from "@/lib/feed";
import { usePersistentState } from "@/lib/persist";
import { TIERS, scoreAt } from "@/lib/ranking";
import type { ListTier, Place, PlaceLog, Trip } from "@/lib/types";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

interface ListPrefs {
  /** Post new ratings to the community feed automatically. */
  autoShare: boolean;
  /** Places the user said they haven't been to, so the rate stream skips them. */
  skipped: string[];
}

/** Which place the global rate sheet is open for, and where it starts. */
export interface RateTarget {
  place: Place;
  step: "tier" | "compare" | "details";
  tier?: ListTier;
  /** Photo to pre-attach (from the camera-roll import). */
  photo?: string;
}

export interface RankedLog {
  log: PlaceLog;
  rank: number;
  tierIndex: number;
  score: number;
}

export type LogDetails = Partial<Pick<PlaceLog, "visitedOn" | "photos" | "favorites" | "with" | "note">>;

const DEFAULT_PREFS: ListPrefs = { autoShare: true, skipped: [] };

const scoreOf = (list: PlaceLog[], log: PlaceLog): number => {
  const tierList = list.filter((l) => l.tier === log.tier);
  return scoreAt(log.tier, Math.max(0, tierList.findIndex((l) => l.id === log.id)), tierList.length);
};

/**
 * The user's own list: places they've been (ranked inside Loved / Liked / Meh), with photos, dates,
 * favorites and companions. Ratings can be shared to the community feed.
 * Order inside `logs` is the ranking order within each tier.
 */
export const [ListProvider, useList] = createContextHook(() => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [logs, setLogs] = usePersistentState<PlaceLog[]>("xp.list.v1", []);
  const [prefs, setPrefs] = usePersistentState<ListPrefs>("xp.listPrefs.v1", DEFAULT_PREFS);
  const [wantPlaces, setWantPlaces] = usePersistentState<Place[]>("xp.wants.v1", []);
  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const { savedIds, toggleSaved } = useTrips();

  const byTier = useMemo(() => {
    const out: Record<ListTier, PlaceLog[]> = { loved: [], liked: [], meh: [] };
    logs.forEach((l) => out[l.tier].push(l));
    return out;
  }, [logs]);

  const ranked = useMemo<RankedLog[]>(() => {
    const out: RankedLog[] = [];
    TIERS.forEach((tier) => byTier[tier].forEach((log, i) => out.push({ log, tierIndex: i, rank: out.length + 1, score: scoreAt(tier, i, byTier[tier].length) })));
    return out;
  }, [byTier]);

  const rankedById = useMemo(() => new Map(ranked.map((r) => [r.log.id, r])), [ranked]);
  const logFor = useCallback((placeId: string) => rankedById.get(placeId), [rankedById]);

  // Shares for one place run one after another so a quick edit never creates a duplicate post.
  const postIds = useRef<Map<string, string>>(new Map());
  const chains = useRef<Map<string, Promise<unknown>>>(new Map());

  /** Shares (or re-shares) a log to the feed. Returns the post id. */
  const postLog = useCallback(
    async (log: PlaceLog, score: number): Promise<string | undefined> => {
      if (!user) return undefined;
      const body = {
        type: "log",
        replaceId: postIds.current.get(log.id) ?? log.postId,
        name: profile.name,
        avatar: user.picture ?? "",
        title: log.place.name,
        note: log.note,
        place: toSnap(log.place),
        tier: log.tier,
        score,
        visitedOn: log.visitedOn,
        dishes: log.favorites,
        with: log.with,
        photos: log.photos,
        taste: tasteSnapshot(profile),
      };
      const res = await fetchWithAuth(`${BACKEND_PATH}/feed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const { post } = await readJson<{ post: FeedPost }>(res);
      postIds.current.set(log.id, post.id);
      setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, postId: post.id, photos: l.photos.map((p, i) => (p.startsWith("data:") && post.photos[i] ? post.photos[i] : p)) } : l)));
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
      void queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY });
      return post.id;
    },
    [user, profile, setLogs, queryClient],
  );

  const shareLog = useCallback(
    (log: PlaceLog, score: number): Promise<string | undefined> => {
      const prev = chains.current.get(log.id) ?? Promise.resolve();
      const next = prev.then(() => postLog(log, score));
      chains.current.set(log.id, next.catch(() => undefined));
      return next;
    },
    [postLog],
  );

  const trySync = useCallback(
    (list: PlaceLog[], log: PlaceLog, force = false) => {
      if (!user || (!force && !prefs.autoShare && !log.postId && !postIds.current.has(log.id))) return;
      shareLog(log, scoreOf(list, log)).catch((e) => {
        console.warn("[list] share failed", e instanceof Error ? e.message : e);
        if (force) toast.error(e instanceof Error ? e.message : "Couldn't post to the feed. Try again.");
      });
    },
    [user, prefs.autoShare, shareLog],
  );

  /** Places a place into a tier at `index` (0 = best in that tier). Replaces any earlier rating. */
  const placeLog = useCallback(
    (place: Place, tier: ListTier, index: number, details?: LogDetails, opts?: { sync?: boolean }): PlaceLog => {
      const now = Date.now();
      const prev = logs.find((l) => l.id === place.id);
      const log: PlaceLog = {
        id: place.id,
        place,
        tier,
        visitedOn: details?.visitedOn ?? prev?.visitedOn,
        photos: details?.photos ?? prev?.photos ?? [],
        favorites: details?.favorites ?? prev?.favorites ?? [],
        with: details?.with ?? prev?.with ?? [],
        note: details?.note ?? prev?.note ?? "",
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        postId: prev?.postId,
      };
      const rest = logs.filter((l) => l.id !== place.id);
      const tierItems = rest.filter((l) => l.tier === tier);
      const anchor = tierItems[Math.min(index, tierItems.length)];
      let next: PlaceLog[];
      if (anchor) {
        const at = rest.indexOf(anchor);
        next = [...rest.slice(0, at), log, ...rest.slice(at)];
      } else {
        const lastOfTier = tierItems[tierItems.length - 1];
        const at = lastOfTier ? rest.indexOf(lastOfTier) + 1 : rest.length;
        next = [...rest.slice(0, at), log, ...rest.slice(at)];
      }
      setLogs(next);
      setPrefs((p) => (p.skipped.includes(place.id) ? { ...p, skipped: p.skipped.filter((x) => x !== place.id) } : p));
      setWantPlaces((prev) => (prev.some((w) => w.id === place.id) ? prev.filter((w) => w.id !== place.id) : prev));
      if (opts?.sync !== false) trySync(next, log);
      return log;
    },
    [logs, setLogs, setPrefs, setWantPlaces, trySync],
  );

  /** Adds many visited places at once (photo import) at the bottom of a tier, without posting. Existing ratings are kept. */
  const importLogs = useCallback(
    (entries: { place: Place; tier: ListTier; details?: LogDetails }[]) => {
      const now = Date.now();
      setLogs((prev) => {
        const fresh = entries
          .filter((e) => !prev.some((l) => l.id === e.place.id))
          .map<PlaceLog>((e) => ({
            id: e.place.id,
            place: e.place,
            tier: e.tier,
            visitedOn: e.details?.visitedOn,
            photos: e.details?.photos ?? [],
            favorites: e.details?.favorites ?? [],
            with: e.details?.with ?? [],
            note: e.details?.note ?? "",
            createdAt: now,
            updatedAt: now,
          }));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    },
    [setLogs],
  );

  /** Saves photos, date, favorites, companions and notes on an existing log. */
  const updateLog = useCallback(
    (id: string, patch: LogDetails, opts?: { share?: boolean }) => {
      const cur = logs.find((l) => l.id === id);
      if (!cur) return;
      const log = { ...cur, ...patch, updatedAt: Date.now() };
      const next = logs.map((l) => (l.id === id ? log : l));
      setLogs(next);
      if (opts?.share === false) return;
      trySync(next, log, opts?.share === true);
    },
    [logs, setLogs, trySync],
  );

  const removeLog = useCallback(
    (id: string) => {
      const cur = logs.find((l) => l.id === id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
      const postId = postIds.current.get(id) ?? cur?.postId;
      postIds.current.delete(id);
      if (postId && user) {
        void fetchWithAuth(`${BACKEND_PATH}/feed/${postId}`, { method: "DELETE" })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: FEED_KEY });
            void queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY });
          })
          .catch(() => undefined);
      }
    },
    [logs, setLogs, user, queryClient],
  );

  /** Want-to-go list: catalog places use the existing saved list; places from anywhere are stored whole. */
  const isWant = useCallback((id: string) => savedIds.includes(id) || wantPlaces.some((w) => w.id === id), [savedIds, wantPlaces]);
  const toggleWant = useCallback(
    (place: Place) => {
      if (!place.custom) return toggleSaved(place.id);
      setWantPlaces((prev) => (prev.some((w) => w.id === place.id) ? prev.filter((w) => w.id !== place.id) : [place, ...prev]));
    },
    [toggleSaved, setWantPlaces],
  );

  const openRate = useCallback((place: Place, step: RateTarget["step"] = "tier", tier?: ListTier, photo?: string) => setRateTarget({ place, step, tier, photo }), []);

  /** Places found by the photo import, waiting to be rated (this session only). */
  const [imported, setImported] = useState<{ place: Place; photo?: string }[]>([]);
  const closeRate = useCallback(() => setRateTarget(null), []);

  const skipPlace = useCallback((id: string) => setPrefs((p) => ({ ...p, skipped: [...p.skipped.filter((x) => x !== id), id].slice(-500) })), [setPrefs]);
  const setAutoShare = useCallback((autoShare: boolean) => setPrefs((p) => ({ ...p, autoShare })), [setPrefs]);

  /** Posts a whole trip to the feed so others can copy it in one tap. */
  const shareTrip = useCallback(
    async (trip: Trip, title: string, note: string, photos: string[] = []): Promise<FeedPost> => {
      if (!user) throw new Error("Sign in to share trips.");
      const res = await fetchWithAuth(`${BACKEND_PATH}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "trip", name: profile.name, avatar: user.picture ?? "", title, note, trip: tripToSnap(trip), photos: photos.filter((p) => !p.startsWith("data:")), taste: tasteSnapshot(profile) }),
      });
      const { post } = await readJson<{ post: FeedPost }>(res);
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
      return post;
    },
    [user, profile, queryClient],
  );

  return {
    logs,
    byTier,
    ranked,
    logFor,
    placeLog,
    importLogs,
    updateLog,
    removeLog,
    shareLog: (log: PlaceLog) => trySync(logs, log, true),
    shareTrip,
    wantPlaces,
    isWant,
    toggleWant,
    rateTarget,
    openRate,
    imported,
    setImported,
    closeRate,
    skipped: prefs.skipped,
    skipPlace,
    autoShare: prefs.autoShare,
    setAutoShare,
    canShare: Boolean(user),
  };
});
