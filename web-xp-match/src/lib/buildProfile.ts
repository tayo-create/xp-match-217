import { QUIZ } from "@/data/quiz";
import { ALL_TAGS } from "@/data/travelerTypes";
import { categoriesFromBlend, defaultDials, normalizeBlend, summarize } from "@/lib/match";
import type { Blend, CategoryScores, StyleDials, TasteProfile } from "@/lib/types";

/** Answers keyed by question id; multi-select questions hold several option ids. */
export type QuizAnswers = Record<string, string[]>;

/** Turns questionnaire answers into a full Taste Profile with blend + coefficients. */
export const profileFromQuiz = (answers: QuizAnswers, name: string): TasteProfile => {
  const pts: Blend = { curator: 1, drifter: 1, trailblazer: 1, architect: 1 };
  const deltas: CategoryScores = { eat: 0, do: 0, stay: 0, move: 0 };
  const likes = new Set<string>();
  const loves = new Set<string>();
  const dialAnswers: Partial<StyleDials> = {};
  let budget = 2;

  QUIZ.forEach((q) => {
    (answers[q.id] ?? []).forEach((raw) => {
      const loved = raw.endsWith("!");
      const optId = loved ? raw.slice(0, -1) : raw;
      const opt = q.options.find((o) => o.id === optId);
      if (!opt) return;
      if (loved) opt.likes?.forEach((l) => loves.add(l));
      if (opt.dial) Object.assign(dialAnswers, opt.dial);
      if (opt.pts) (Object.keys(opt.pts) as (keyof Blend)[]).forEach((k) => (pts[k] += opt.pts?.[k] ?? 0));
      if (opt.cat) (Object.keys(opt.cat) as (keyof CategoryScores)[]).forEach((k) => (deltas[k] += opt.cat?.[k] ?? 0));
      opt.likes?.forEach((l) => likes.add(l));
      if (opt.budget) budget = opt.budget;
    });
  });

  // Sharpen the blend so the dominant type reads clearly.
  const sharpened = Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, Math.pow(v, 1.6)])) as Blend;
  const blend = normalizeBlend(sharpened);
  const likeList = [...likes];
  const answeredStyle = Object.keys(dialAnswers).length > 0;
  return {
    name: name.trim() || "Traveler",
    blend,
    categories: categoriesFromBlend(blend, deltas),
    likes: likeList,
    loves: [...loves],
    dials: { ...defaultDials({ blend, budget }), ...dialAnswers },
    dialsSource: answeredStyle ? "quiz" : "default",
    dislikes: [],
    budget,
    summary: summarize(blend, likeList),
    source: "quiz",
    createdAt: Date.now(),
  };
};

export interface AiProfileDraft {
  blend?: Partial<Blend>;
  categories?: Partial<CategoryScores>;
  likes?: string[];
  dislikes?: string[];
  budget?: number;
  summary?: string;
}

const clampScore = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(Math.max(10, Math.min(99, n))) : fallback;
};

/** Validates and normalizes a profile produced by the AI interview. */
export const profileFromAi = (draft: AiProfileDraft, name: string): TasteProfile => {
  const blend = normalizeBlend(draft.blend ?? {});
  const implied = categoriesFromBlend(blend);
  const categories: CategoryScores = {
    eat: clampScore(draft.categories?.eat, implied.eat),
    do: clampScore(draft.categories?.do, implied.do),
    stay: clampScore(draft.categories?.stay, implied.stay),
    move: clampScore(draft.categories?.move, implied.move),
  };
  const likes = (draft.likes ?? []).filter((t) => ALL_TAGS.includes(t));
  const dislikes = (draft.dislikes ?? []).filter((t) => ALL_TAGS.includes(t) && !likes.includes(t));
  const budget = Math.max(1, Math.min(3, Math.round(Number(draft.budget) || 2)));
  return {
    name: name.trim() || "Traveler",
    blend,
    categories,
    likes,
    dislikes,
    budget,
    summary: typeof draft.summary === "string" && draft.summary.length > 20 ? draft.summary : summarize(blend, likes),
    source: "interview",
    createdAt: Date.now(),
  };
};
