import type { ListTier } from "@/lib/types";

export const TIERS: ListTier[] = ["loved", "liked", "meh"];

/** Each tier owns a band of the 0–10 scale; position inside the tier picks the exact score. */
export const TIER_META: Record<ListTier, { label: string; short: string; color: string; top: number; bottom: number }> = {
  loved: { label: "Loved it", short: "Loved", color: "#C8452D", top: 10, bottom: 7 },
  liked: { label: "It was good", short: "Liked", color: "#C98A1B", top: 6.9, bottom: 4 },
  meh: { label: "It was fine", short: "Meh", color: "#8C8577", top: 3.9, bottom: 1 },
};

/** Score for the item at `index` in a tier of `count` items (best first). */
export const scoreAt = (tier: ListTier, index: number, count: number): number => {
  const { top, bottom } = TIER_META[tier];
  if (count <= 1) return Math.round((bottom + (top - bottom) * 0.7) * 10) / 10;
  const t = index / (count - 1);
  return Math.round((top - t * (top - bottom)) * 10) / 10;
};

/** Binary-insertion state for "which did you like more?" comparisons. */
export interface CompareState {
  lo: number;
  hi: number;
}

export const compareStart = (count: number): CompareState => ({ lo: 0, hi: count });
export const compareMid = (s: CompareState): number => Math.floor((s.lo + s.hi) / 2);
export const compareDone = (s: CompareState): boolean => s.lo >= s.hi;
/** `newIsBetter` = the new place beat the one at the midpoint. */
export const compareStep = (s: CompareState, newIsBetter: boolean): CompareState => {
  const mid = compareMid(s);
  return newIsBetter ? { lo: s.lo, hi: mid } : { lo: mid + 1, hi: s.hi };
};
/** Roughly how many questions a tier of `count` places takes. */
export const compareTotal = (count: number): number => (count <= 0 ? 0 : Math.ceil(Math.log2(count + 1)));
