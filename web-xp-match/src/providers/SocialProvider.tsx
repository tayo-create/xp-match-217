import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { tagLabel } from "@/data/travelerTypes";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { matchTraveler } from "@/lib/match";
import { usePersistentState } from "@/lib/persist";
import { asProfile, publicProfile } from "@/lib/sharedProfile";
import type { DirectMessage, Thread, Traveler } from "@/lib/types";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

interface DirectoryEntry {
  userId: string;
  name: string;
  avatar: string;
  home: string;
  bio: string;
  upcoming: string;
  interests: string[];
  savedPlaceIds: string[];
  profile: unknown;
  updatedAt: number;
}

interface ThreadRec {
  otherId: string;
  otherName: string;
  otherAvatar: string;
  messages: { id: string; fromId: string; text: string; at: number }[];
  unread: number;
  updatedAt: number;
}

/** What I show other travelers in the directory. */
export interface PublicCard {
  discoverable: boolean;
  home: string;
  bio: string;
}

export interface TravelerMatch {
  traveler: Traveler;
  score: number;
}

const DEFAULT_CARD: PublicCard = { discoverable: true, home: "", bio: "" };

const toTraveler = (e: DirectoryEntry): Traveler => {
  const profile = asProfile(e.profile, e.name);
  return {
    id: e.userId,
    name: e.name,
    home: e.home,
    avatar: e.avatar,
    bio: e.bio || profile?.summary || "",
    blend: profile?.blend ?? { curator: 25, drifter: 25, trailblazer: 25, architect: 25 },
    categories: profile?.categories ?? { eat: 60, do: 60, stay: 60, move: 60 },
    likes: profile?.likes ?? [],
    interests: e.interests,
    savedPlaceIds: e.savedPlaceIds,
    upcoming: e.upcoming,
    profile,
  };
};

const shortRange = (start: string, end: string): string => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return s.getMonth() === e.getMonth() ? `${m(s)} ${s.getDate()}–${e.getDate()}` : `${m(s)} ${s.getDate()}–${m(e)} ${e.getDate()}`;
};

/**
 * Real people on XP Match: the traveler directory (signed-in users who chose to be discoverable)
 * and direct messages between them, delivered through the backend.
 */
export const [SocialProvider, useSocial] = createContextHook(() => {
  const { user } = useAuth();
  const { profile, hasProfile } = useProfile();
  const { trips, myPlaceIds } = useTrips();
  const queryClient = useQueryClient();
  const [savedTravelers, setSavedTravelers] = usePersistentState<string[]>("xp.savedTravelers.v1", []);
  const [card, setCard] = usePersistentState<PublicCard>("xp.publicCard.v1", DEFAULT_CARD);
  const userId = user?.id;

  const directory = useQuery({
    queryKey: ["directory", userId],
    queryFn: async () => readJson<{ entries: DirectoryEntry[] }>(await fetchWithAuth(`${BACKEND_PATH}/directory`)),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });

  const travelers = useMemo<Traveler[]>(() => (directory.data?.entries ?? []).filter((e) => e.userId !== userId).map(toTraveler), [directory.data, userId]);

  const travelerMatches = useMemo<TravelerMatch[]>(
    () => travelers.map((traveler) => ({ traveler, score: matchTraveler(profile, traveler) })).sort((a, b) => b.score - a.score),
    [travelers, profile],
  );

  const travelerById = useCallback((id: string | undefined) => travelers.find((t) => t.id === id), [travelers]);
  const matchFor = useCallback((id: string): number => travelerMatches.find((m) => m.traveler.id === id)?.score ?? 0, [travelerMatches]);

  // Keep my directory card current (debounced). Only real, finished profiles are listed.
  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const next = [...trips].filter((t) => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return next ? `${next.city} · ${shortRange(next.startDate, next.endDate)}` : "";
  }, [trips]);

  const myEntry = useMemo(
    () => ({
      name: profile.name,
      avatar: user?.picture ?? "",
      home: card.home,
      bio: card.bio,
      upcoming,
      interests: profile.likes.slice(0, 4).map(tagLabel),
      savedPlaceIds: [...myPlaceIds].slice(0, 60),
      profile: publicProfile(profile),
    }),
    [profile, user?.picture, card.home, card.bio, upcoming, myPlaceIds],
  );
  const published = useRef<string>("");

  useEffect(() => {
    if (!userId) {
      published.current = "";
      return;
    }
    const listed = card.discoverable && hasProfile;
    const key = listed ? JSON.stringify(myEntry) : "hidden";
    if (key === published.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = listed
          ? await fetchWithAuth(`${BACKEND_PATH}/directory/me`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(myEntry) })
          : await fetchWithAuth(`${BACKEND_PATH}/directory/me`, { method: "DELETE" });
        await readJson<unknown>(res);
        published.current = key;
        void queryClient.invalidateQueries({ queryKey: ["directory", userId] });
      } catch (e) {
        console.warn("[directory] publish failed", e instanceof Error ? e.message : e);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [userId, card.discoverable, hasProfile, myEntry, queryClient]);

  const inboxKey = useMemo(() => ["inbox", userId] as const, [userId]);
  const inbox = useQuery({
    queryKey: inboxKey,
    queryFn: async () => readJson<{ threads: ThreadRec[] }>(await fetchWithAuth(`${BACKEND_PATH}/inbox`)),
    enabled: Boolean(userId),
    refetchInterval: 6000,
    refetchIntervalInBackground: false,
  });

  const threads = useMemo<Thread[]>(
    () =>
      (inbox.data?.threads ?? []).map((t) => ({
        travelerId: t.otherId,
        otherName: t.otherName,
        otherAvatar: t.otherAvatar,
        unread: t.unread,
        messages: t.messages.map<DirectMessage>((m) => ({ id: m.id, from: m.fromId === userId ? "me" : "them", text: m.text, at: m.at })),
      })),
    [inbox.data, userId],
  );

  const threadFor = useCallback((id: string) => threads.find((t) => t.travelerId === id), [threads]);
  const unreadTotal = useMemo(() => threads.reduce((s, t) => s + t.unread, 0), [threads]);

  const patchThread = useCallback(
    (otherId: string, fn: (t: ThreadRec | undefined) => ThreadRec | undefined) =>
      queryClient.setQueryData<{ threads: ThreadRec[] }>(inboxKey, (prev) => {
        const list = prev?.threads ?? [];
        const cur = list.find((t) => t.otherId === otherId);
        const next = fn(cur);
        const rest = list.filter((t) => t.otherId !== otherId);
        return { threads: next ? [next, ...rest] : rest };
      }),
    [queryClient, inboxKey],
  );

  const markRead = useCallback(
    (otherId: string) => {
      const t = inbox.data?.threads.find((x) => x.otherId === otherId);
      if (!userId || !t?.unread) return;
      queryClient.setQueryData<{ threads: ThreadRec[] }>(inboxKey, (prev) => ({ threads: (prev?.threads ?? []).map((x) => (x.otherId === otherId ? { ...x, unread: 0 } : x)) }));
      void fetchWithAuth(`${BACKEND_PATH}/inbox/read/${encodeURIComponent(otherId)}`, { method: "POST" }).catch(() => undefined);
    },
    [inbox.data, userId, queryClient, inboxKey],
  );

  const sendMutation = useMutation({
    mutationFn: async (vars: { to: string; text: string; id: string }) =>
      readJson<{ dm: { id: string; fromId: string; text: string; at: number } }>(
        await fetchWithAuth(`${BACKEND_PATH}/dm/${encodeURIComponent(vars.to)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: vars.text, id: vars.id, name: profile.name, avatar: user?.picture ?? "" }),
        }),
      ),
    onMutate: (vars) => {
      const other = travelers.find((t) => t.id === vars.to);
      patchThread(vars.to, (t) => ({
        otherId: vars.to,
        otherName: t?.otherName ?? other?.name ?? "Traveler",
        otherAvatar: t?.otherAvatar ?? other?.avatar ?? "",
        unread: t?.unread ?? 0,
        updatedAt: Date.now(),
        messages: [...(t?.messages ?? []), { id: vars.id, fromId: userId ?? "me", text: vars.text, at: Date.now() }],
      }));
    },
    onError: (e, vars) => {
      patchThread(vars.to, (t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== vars.id) } : t));
      toast.error(e instanceof Error ? e.message : "Message didn't send. Try again.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: inboxKey }),
  });

  const send = useCallback(
    (to: string, text: string) => {
      const body = text.trim();
      if (!body || !userId) return;
      sendMutation.mutate({ to, text: body, id: `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });
    },
    [sendMutation, userId],
  );

  const toggleSavedTraveler = useCallback(
    (id: string) => setSavedTravelers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setSavedTravelers],
  );

  return {
    isSignedIn: Boolean(userId),
    travelers,
    travelerMatches,
    travelerById,
    matchFor,
    directoryLoading: directory.isLoading,
    directoryError: directory.error instanceof Error ? directory.error.message : null,
    threads,
    threadsLoading: inbox.isLoading,
    threadFor,
    unreadTotal,
    markRead,
    send,
    sending: sendMutation.isPending,
    savedTravelers,
    toggleSavedTraveler,
    card,
    setCard,
    isListed: Boolean(userId) && card.discoverable && hasProfile,
  };
});
