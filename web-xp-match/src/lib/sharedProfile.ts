import { TYPE_ORDER } from "@/data/travelerTypes";
import type { StyleDials, TasteProfile } from "@/lib/types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 60) : []);

/** Validates a taste profile that came from another person (directory or trip room). */
export const asProfile = (raw: unknown, name?: string): TasteProfile | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<TasteProfile>;
  if (!p.blend || !TYPE_ORDER.every((t) => isNum(p.blend?.[t]))) return undefined;
  const c = p.categories;
  if (!c || !isNum(c.eat) || !isNum(c.do) || !isNum(c.stay) || !isNum(c.move)) return undefined;
  const d = p.dials;
  const dials: StyleDials | undefined =
    d && isNum(d.refined) && isNum(d.buzz) && isNum(d.local) && isNum(d.splurge) && isNum(d.modern) ? { refined: d.refined, buzz: d.buzz, local: d.local, splurge: d.splurge, modern: d.modern } : undefined;
  return {
    name: name || (typeof p.name === "string" ? p.name : "Traveler"),
    blend: p.blend,
    categories: c,
    likes: strs(p.likes),
    loves: strs(p.loves),
    dislikes: strs(p.dislikes),
    dials,
    dialsSource: p.dialsSource === "quiz" ? "quiz" : "default",
    budget: isNum(p.budget) ? Math.max(1, Math.min(3, Math.round(p.budget))) : 2,
    summary: typeof p.summary === "string" ? p.summary.slice(0, 400) : "",
    source: p.source === "quiz" || p.source === "interview" ? p.source : "default",
    createdAt: isNum(p.createdAt) ? p.createdAt : 0,
  };
};

/** The parts of my profile I share with trip mates and the directory. */
export const publicProfile = (p: TasteProfile): TasteProfile => ({ ...p, summary: p.summary.slice(0, 300) });

/** "Maya Okafor" -> "Maya". */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;
