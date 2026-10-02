import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { BACKEND_PATH, readJson } from "@/lib/backend";
import type { CommunityScore, FeedPost } from "@/lib/feed";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";

export const FEED_KEY = ["feed"] as const;
export const COMMUNITY_KEY = ["feed-places"] as const;

/** The community feed (public to read). */
export function useFeed() {
  return useQuery({
    queryKey: FEED_KEY,
    queryFn: async () => readJson<{ posts: FeedPost[] }>(await fetch(`${BACKEND_PATH}/feed?limit=150`)),
    refetchInterval: 30_000,
    select: (d) => d.posts,
  });
}

/** Average community rating (0–10) per place id, one vote per person. */
export function useCommunityScores() {
  return useQuery({
    queryKey: COMMUNITY_KEY,
    queryFn: async () => readJson<{ places: Record<string, CommunityScore> }>(await fetch(`${BACKEND_PATH}/feed/places`)),
    staleTime: 60_000,
    select: (d) => d.places,
  });
}

const patchPost = (prev: { posts: FeedPost[] } | undefined, post: FeedPost) => ({ posts: (prev?.posts ?? []).map((p) => (p.id === post.id ? post : p)) });

/** Like, copy and delete actions on feed posts. */
export function useFeedActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const like = useMutation({
    mutationFn: async (id: string) => readJson<{ post: FeedPost }>(await fetchWithAuth(`${BACKEND_PATH}/feed/${id}/like`, { method: "POST" })),
    onMutate: (id) => {
      if (!user) return;
      queryClient.setQueryData<{ posts: FeedPost[] }>(FEED_KEY, (prev) => ({
        posts: (prev?.posts ?? []).map((p) => (p.id === id ? { ...p, likes: p.likes.includes(user.id) ? p.likes.filter((x) => x !== user.id) : [...p.likes, user.id] } : p)),
      }));
    },
    onSuccess: ({ post }) => queryClient.setQueryData<{ posts: FeedPost[] }>(FEED_KEY, (prev) => patchPost(prev, post)),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't save that like.");
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
  });

  const markCopied = useMutation({
    mutationFn: async (id: string) => readJson<{ post: FeedPost }>(await fetchWithAuth(`${BACKEND_PATH}/feed/${id}/copy`, { method: "POST" })),
    onSuccess: ({ post }) => queryClient.setQueryData<{ posts: FeedPost[] }>(FEED_KEY, (prev) => patchPost(prev, post)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => readJson<{ ok: boolean }>(await fetchWithAuth(`${BACKEND_PATH}/feed/${id}`, { method: "DELETE" })),
    onMutate: (id) => queryClient.setQueryData<{ posts: FeedPost[] }>(FEED_KEY, (prev) => ({ posts: (prev?.posts ?? []).filter((p) => p.id !== id) })),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that post.");
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
  });

  return { like, markCopied, remove };
}
