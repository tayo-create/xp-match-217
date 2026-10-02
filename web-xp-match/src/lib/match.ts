import { placeStyle } from "@/data/placeStyle";
import { TRAVELER_TYPES, TYPE_ORDER, tagLabel } from "@/data/travelerTypes";
import type {
  Blend,
  CategoryId,
  CategoryScores,
  DialId,
  MatchResult,
  Place,
  PlaceKind,
  StyleDials,
  TasteProfile,
  Traveler,
  TypeId,
} from "@/lib/types";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const cosine = (a: Blend, b: Blend): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const t of TYPE_ORDER) {
    dot += a[t] * b[t];
    na += a[t] * a[t];
    nb += b[t] * b[t];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

export const kindToCategory = (kind: PlaceKind): CategoryId => {
  if (kind === "eat" || kind === "nightlife") return "eat";
  if (kind === "stay") return "stay";
  if (kind === "move") return "move";
  return "do";
};

/** Returns the archetype with the largest share of a blend. */
export const dominantType = (blend: Blend): TypeId =>
  TYPE_ORDER.reduce((best, t) => (blend[t] > blend[best] ? t : best), TYPE_ORDER[0]);

/** Returns the archetypes sorted by share, largest first. */
export const sortedTypes = (blend: Blend): TypeId[] => [...TYPE_ORDER].sort((a, b) => blend[b] - blend[a]);

/** Normalizes raw points into a blend that sums to exactly 100. */
export const normalizeBlend = (raw: Partial<Blend>): Blend => {
  const vals = TYPE_ORDER.map((t) => Math.max(0, raw[t] ?? 0));
  const total = vals.reduce((s, v) => s + v, 0) || 1;
  const pct = vals.map((v) => (v / total) * 100);
  const floored = pct.map((v) => Math.floor(v));
  let rest = 100 - floored.reduce((s, v) => s + v, 0);
  const order = pct.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    floored[o.i] += 1;
    rest -= 1;
  }
  return {
    curator: floored[0],
    drifter: floored[1],
    trailblazer: floored[2],
    architect: floored[3],
  };
};

/** Category coefficients implied by a blend: weighted average of each archetype's weights. */
export const categoriesFromBlend = (blend: Blend, deltas?: Partial<CategoryScores>): CategoryScores => {
  const out = { eat: 0, do: 0, stay: 0, move: 0 } as CategoryScores;
  (Object.keys(out) as CategoryId[]).forEach((c) => {
    const base = TYPE_ORDER.reduce((s, t) => s + (blend[t] / 100) * TRAVELER_TYPES[t].weights[c], 0);
    out[c] = Math.round(clamp(base + (deltas?.[c] ?? 0), 12, 99));
  });
  return out;
};

/** The five style dials, with the label for each end (0 = left, 100 = right). */
export const DIALS: { id: DialId; left: string; right: string }[] = [
  { id: "refined", left: "No-frills", right: "Refined" },
  { id: "buzz", left: "Intimate", right: "Buzzing" },
  { id: "local", left: "Iconic", right: "Hidden local" },
  { id: "splurge", left: "Thrifty", right: "Splurge" },
  { id: "modern", left: "Old-school", right: "Modern" },
];

const DIAL_BY_TYPE: Record<Exclude<DialId, "splurge">, Record<TypeId, number>> = {
  refined: { curator: 76, architect: 70, drifter: 38, trailblazer: 28 },
  buzz: { curator: 38, architect: 50, drifter: 25, trailblazer: 86 },
  local: { curator: 82, architect: 25, drifter: 66, trailblazer: 62 },
  modern: { curator: 45, architect: 66, drifter: 32, trailblazer: 72 },
};

/** Style dials estimated from the archetype blend and budget, used until the style round is answered. */
export const defaultDials = (profile: Pick<TasteProfile, "blend" | "budget">): StyleDials => {
  const total = TYPE_ORDER.reduce((s, t) => s + profile.blend[t], 0) || 1;
  const from = (id: Exclude<DialId, "splurge">): number => Math.round(TYPE_ORDER.reduce((s, t) => s + (profile.blend[t] / total) * DIAL_BY_TYPE[id][t], 0));
  return { refined: from("refined"), buzz: from("buzz"), local: from("local"), splurge: [0, 20, 50, 82][profile.budget] ?? 50, modern: from("modern") };
};

export const dialsOf = (profile: TasteProfile): StyleDials => profile.dials ?? defaultDials(profile);

const DIAL_WEIGHT: Record<DialId, number> = { refined: 1.1, buzz: 1, local: 1, splurge: 1.2, modern: 0.7 };

/** Per-person score breakdown: the two ingredients plus the final 0–100 score. */
export interface PersonScore extends MatchResult {
  interest: number;
  style: number;
  topInterest?: { tag: string; level: number };
}

const styleNote = (id: DialId, diff: number): string | null => {
  const more = diff > 0;
  switch (id) {
    case "splurge":
      return more ? "Pricier than you usually go" : "Easier on the wallet than you need";
    case "refined":
      return more ? "More polished than your style" : "More no-frills than you like";
    case "buzz":
      return more ? "Livelier than you like" : "Quieter than your usual";
    case "local":
      return more ? "More off-the-map than you tend to go" : "A famous spot, not a hidden one";
    case "modern":
      return more ? "More modern than your taste" : "More old-school than your taste";
  }
};

const styleFitNote = (id: DialId, value: number): string => {
  const d = DIALS.find((x) => x.id === id);
  const side = value >= 50 ? d?.right : d?.left;
  return `Your kind of ${side?.toLowerCase() ?? "place"}`;
};

/**
 * Scores one place against one profile (5–99) from two ingredients:
 * interest fit (~40%): how strongly the place delivers what they love, and
 * style fit (~60%): how close the place sits to their five style dials.
 * The blend is curved so strong fits separate clearly from average ones.
 */
export const scorePlace = (profile: TasteProfile, place: Place): PersonScore => {
  const { levels, dials: pd } = placeStyle(place);
  const loves = new Set(profile.loves ?? []);
  const cat = kindToCategory(place.kind);
  const coef = profile.categories[cat] / 100;

  const hits = profile.likes
    .concat([...loves].filter((t) => !profile.likes.includes(t)))
    .map((tag) => ({ tag, level: levels[tag] ?? 0, w: loves.has(tag) ? 1 : 0.75 }))
    .filter((h) => h.level > 0)
    .sort((a, b) => b.level * b.w - a.level * a.w);
  const c = hits.map((h) => h.level * h.w);
  let interest = (c[0] ?? 0) + 0.35 * (c[1] ?? 0) + 0.15 * (c[2] ?? 0);
  const misses = profile.dislikes.filter((t) => (levels[t] ?? 0) > 0);
  interest -= misses.reduce((s, t) => s + 0.45 * (levels[t] ?? 0), 0);
  interest = clamp(interest * (0.72 + 0.28 * coef), 0, 1);

  const ud = dialsOf(profile);
  let wsum = 0;
  let dist = 0;
  const gaps: { id: DialId; diff: number }[] = [];
  for (const { id } of DIALS) {
    const diff = pd[id] - ud[id];
    gaps.push({ id, diff });
    dist += DIAL_WEIGHT[id] * Math.abs(diff);
    wsum += DIAL_WEIGHT[id];
  }
  const style = clamp(1 - (dist / wsum / 100) * 1.7, 0, 1);

  const raw = 0.4 * interest + 0.6 * style;
  const score = Math.round(clamp(100 * Math.pow(raw, 0.85), 5, 99));

  const reasons: string[] = [];
  const top = hits[0];
  if (top && top.level >= 0.5) reasons.push(`Big on ${tagLabel(top.tag).toLowerCase()} (${Math.round(top.level * 100)})`);
  if (hits[1] && hits[1].level >= 0.6) reasons.push(`Also delivers ${tagLabel(hits[1].tag).toLowerCase()}`);
  if (!top) reasons.push("Not much of what you said you love");
  const sortedGaps = [...gaps].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const close = [...gaps].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
  if (close && Math.abs(close.diff) <= 15 && close.id !== "modern") reasons.push(styleFitNote(close.id, ud[close.id]));
  for (const g of sortedGaps.slice(0, 2)) {
    if (Math.abs(g.diff) < 30) break;
    const note = styleNote(g.id, g.diff);
    if (note) reasons.push(note);
  }
  if (misses.length) reasons.push(`Heads-up: ${misses.map(tagLabel).join(", ").toLowerCase()}`);

  const contributions = TYPE_ORDER.map((t) => ({ t, v: profile.blend[t] * place.affinity[t] })).sort((a, b) => b.v - a.v);
  return { score, reasons: reasons.slice(0, 4), dominantType: contributions[0].t, interest, style, topInterest: top ? { tag: top.tag, level: top.level } : undefined };
};

/** Same as scorePlace; kept for existing call sites that only need the match result. */
export const matchPlace = (profile: TasteProfile, place: Place): MatchResult => scorePlace(profile, place);

/**
 * The group score: half the average, half the lowest individual score.
 * Consensus beats passion: 85 + 85 → 85, while 95 + 80 → 84 and 95 + 10 → 31.
 */
export const groupScore = (scores: number[]): number => {
  if (!scores.length) return 0;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  return Math.round(0.5 * avg + 0.5 * Math.min(...scores));
};

/** Ranks places for a profile, highest match first. */
export const rankPlaces = (profile: TasteProfile, places: Place[]): { place: Place; match: MatchResult }[] =>
  places
    .map((place) => ({ place, match: matchPlace(profile, place) }))
    .sort((a, b) => b.match.score - a.match.score);

/** Similarity between two travelers' tastes (0–99). */
export const matchTraveler = (
  profile: Pick<TasteProfile, "blend" | "categories" | "likes">,
  other: Pick<Traveler, "blend" | "categories" | "likes">,
): number => {
  const blendSim = cosine(profile.blend, other.blend);
  const shared = profile.likes.filter((l) => other.likes.includes(l)).length;
  const union = new Set([...profile.likes, ...other.likes]).size || 1;
  const likeSim = shared / union;
  const catDiff =
    (Object.keys(profile.categories) as CategoryId[]).reduce(
      (s, c) => s + Math.abs(profile.categories[c] - other.categories[c]),
      0,
    ) / 400;
  const raw = 0.62 * clamp((blendSim - 0.3) / 0.7, 0, 1) + 0.23 * clamp(likeSim * 2.2, 0, 1) + 0.15 * (1 - catDiff);
  return Math.round(clamp(52 + 47 * raw, 30, 99));
};

export const sharedLikes = (a: string[], b: string[]): string[] => a.filter((x) => b.includes(x));

/** Human description of a blend, e.g. "Curator-Drifter". */
export const blendLabel = (blend: Blend): string => {
  const [first, second] = sortedTypes(blend);
  if (blend[second] >= 20) return `${TRAVELER_TYPES[first].short}-${TRAVELER_TYPES[second].short}`;
  return TRAVELER_TYPES[first].short;
};

/** Builds the short narrative shown on the profile page. */
export const summarize = (blend: Blend, likes: string[]): string => {
  const [first, second] = sortedTypes(blend);
  const a = TRAVELER_TYPES[first];
  const b = TRAVELER_TYPES[second];
  const loves = likes.slice(0, 3).map(tagLabel);
  const lovesText = loves.length > 0 ? ` You light up for ${loves.join(", ")}.` : "";
  return `${a.description} With a ${b.short.toLowerCase()} streak, you lean toward ${b.styles.do}.${lovesText}`;
};
