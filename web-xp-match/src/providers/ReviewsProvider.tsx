import createContextHook from "@nkzw/create-context-hook";
import { useCallback } from "react";

import { SEED_REVIEWS } from "@/data/seed";
import { uid, usePersistentState } from "@/lib/persist";
import type { Review } from "@/lib/types";

export const [ReviewsProvider, useReviews] = createContextHook(() => {
  const [reviews, setReviews] = usePersistentState<Review[]>("xp.reviews.v1", SEED_REVIEWS);
  const [helpfulIds, setHelpfulIds] = usePersistentState<string[]>("xp.helpful.v1", []);

  const reviewsFor = useCallback((placeId: string) => reviews.filter((r) => r.placeId === placeId), [reviews]);

  const addReview = useCallback(
    (r: Omit<Review, "id" | "createdAt" | "helpful" | "mine">) => {
      setReviews((prev) => [{ ...r, id: uid("rev"), createdAt: Date.now(), helpful: 0, mine: true }, ...prev]);
    },
    [setReviews],
  );

  const deleteReview = useCallback((id: string) => setReviews((prev) => prev.filter((r) => r.id !== id)), [setReviews]);

  const toggleHelpful = useCallback(
    (id: string) => {
      const was = helpfulIds.includes(id);
      setHelpfulIds((prev) => (was ? prev.filter((x) => x !== id) : [...prev, id]));
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, helpful: r.helpful + (was ? -1 : 1) } : r)));
    },
    [helpfulIds, setHelpfulIds, setReviews],
  );

  const stats = useCallback(
    (placeId: string) => {
      const list = reviews.filter((r) => r.placeId === placeId);
      const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
      return { count: list.length, avg };
    },
    [reviews],
  );

  return { reviews, reviewsFor, addReview, deleteReview, toggleHelpful, helpfulIds, stats };
});
