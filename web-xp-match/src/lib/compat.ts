import { TYPE_ORDER } from "@/data/travelerTypes";
import { DIALS, dialsOf } from "@/lib/match";
import type { CategoryId, DialId, TasteProfile } from "@/lib/types";

/** The slice of a Taste Profile attached to feed posts so others can compute compatibility. */
export interface TasteSnapshot {
  blend: TasteProfile["blend"];
  categories: TasteProfile["categories"];
  likes: string[];
  loves: string[];
  dials: NonNullable<TasteProfile["dials"]>;
  budget: number;
}

export const tasteSnapshot = (p: TasteProfile): TasteSnapshot => ({
  blend: p.blend,
  categories: p.categories,
  likes: p.likes.slice(0, 30),
  loves: (p.loves ?? []).slice(0, 20),
  dials: dialsOf(p),
  budget: p.budget,
});

/** A place both people rated, with each person's 0–10 score. */
export interface RatingOverlap {
  placeId: string;
  name: string;
  mine: number;
  theirs: number;
}

export interface CompatPart {
  id: "archetype" | "interests" | "style" | "ratings";
  label: string;
  /** 0–100 */
  value: number;
  detail: string;
}

export interface Compatibility {
  score: number;
  label: string;
  parts: CompatPart[];
  sharedTags: string[];
  overlaps: RatingOverlap[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const cosine = (a: TasteProfile["blend"], b: TasteProfile["blend"]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const t of TYPE_ORDER) {
    dot += a[t] * b[t];
    na += a[t] * a[t];
    nb += b[t] * b[t];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

const DIAL_WEIGHT: Record<DialId, number> = { refined: 1.1, buzz: 1, local: 1, splurge: 1.2, modern: 0.7 };

export const compatLabel = (score: number): string =>
  score >= 90 ? "Taste twin" : score >= 80 ? "Great match" : score >= 68 ? "Good match" : score >= 55 ? "Some overlap" : "Different tastes";

/**
 * How compatible two travelers' tastes are (0–99): archetype blend, shared interests, style dials,
 * and, when they've rated the same places, how closely their ratings agree.
 */
export function compatibility(me: TasteProfile, them: TasteProfile | undefined, overlaps: RatingOverlap[]): Compatibility | undefined {
  const parts: CompatPart[] = [];
  let sharedTags: string[] = [];
  let base: number | undefined;

  if (them) {
    const arche = clamp((cosine(me.blend, them.blend) - 0.35) / 0.65, 0, 1);
    const mine = new Set([...me.likes, ...(me.loves ?? [])]);
    const theirs = new Set([...them.likes, ...(them.loves ?? [])]);
    sharedTags = [...mine].filter((t) => theirs.has(t));
    const loveBoost = (me.loves ?? []).filter((t) => (them.loves ?? []).includes(t)).length * 0.5;
    const union = new Set([...mine, ...theirs]).size || 1;
    const interests = clamp(((sharedTags.length + loveBoost) / union) * 2.4, 0, 1);

    const a = dialsOf(me);
    const b = dialsOf(them);
    let wsum = 0;
    let dsum = 0;
    let closest: { label: string; gap: number } | undefined;
    for (const d of DIALS) {
      const gap = Math.abs(a[d.id] - b[d.id]);
      wsum += DIAL_WEIGHT[d.id];
      dsum += DIAL_WEIGHT[d.id] * gap;
      const side = (a[d.id] + b[d.id]) / 2 >= 50 ? d.right : d.left;
      if (!closest || gap < closest.gap) closest = { label: side, gap };
    }
    const style = clamp(1 - dsum / wsum / 60, 0, 1);
    const catKeys = Object.keys(me.categories) as CategoryId[];
    const cats = 1 - catKeys.reduce((s, c) => s + Math.abs(me.categories[c] - (them.categories[c] ?? 60)), 0) / (catKeys.length * 100);

    base = 0.34 * arche + 0.26 * interests + 0.3 * style + 0.1 * cats;
    parts.push(
      { id: "archetype", label: "Travel personality", value: Math.round(arche * 100), detail: arche >= 0.75 ? "You plan and explore the same way" : arche >= 0.45 ? "Similar instincts, different priorities" : "You travel quite differently" },
      { id: "interests", label: "Shared interests", value: Math.round(interests * 100), detail: sharedTags.length ? `${sharedTags.length} in common` : "No interests in common yet" },
      { id: "style", label: "Style", value: Math.round(style * 100), detail: closest && closest.gap <= 15 ? `You both lean ${closest.label.toLowerCase()}` : "Different style dials" },
    );
  }

  let ratings: number | undefined;
  if (overlaps.length) {
    const avgGap = overlaps.reduce((s, o) => s + Math.abs(o.mine - o.theirs), 0) / overlaps.length;
    ratings = clamp(1 - avgGap / 6, 0, 1);
    parts.push({
      id: "ratings",
      label: "Rating agreement",
      value: Math.round(ratings * 100),
      detail: `${overlaps.length} ${overlaps.length === 1 ? "place" : "places"} you both rated, ${avgGap.toFixed(1)} pts apart on average`,
    });
  }

  if (base === undefined && (ratings === undefined || overlaps.length < 2)) return undefined;
  const w = ratings === undefined ? 0 : base === undefined ? 1 : Math.min(0.45, 0.12 * overlaps.length);
  const raw = (base ?? 0) * (1 - w) + (ratings ?? 0) * w;
  const score = Math.round(clamp(28 + 71 * raw, 20, 99));
  return { score, label: compatLabel(score), parts, sharedTags, overlaps: [...overlaps].sort((x, y) => Math.abs(x.mine - x.theirs) - Math.abs(y.mine - y.theirs)) };
}
