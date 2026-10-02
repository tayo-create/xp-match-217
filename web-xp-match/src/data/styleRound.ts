import type { DialId } from "@/lib/types";

export interface StyleQuestion {
  dial: DialId;
  prompt: string;
  left: { label: string; sub: string };
  right: { label: string; sub: string };
}

/** The this-or-that round: one question per style dial. */
export const STYLE_ROUND: StyleQuestion[] = [
  {
    dial: "refined",
    prompt: "Tonight's steak comes from…",
    left: { label: "A no-frills grill counter", sub: "Paper napkins, perfect char" },
    right: { label: "A polished dining room", sub: "Linen, sommelier, a tasting of cuts" },
  },
  {
    dial: "buzz",
    prompt: "The room you want around you:",
    left: { label: "Eight tables, candlelight", sub: "You can hear each other talk" },
    right: { label: "Packed and buzzing", sub: "Music up, people everywhere" },
  },
  {
    dial: "local",
    prompt: "Given one dinner in a new city:",
    left: { label: "The famous one", sub: "The place everyone says you must try" },
    right: { label: "The hidden local", sub: "No sign, no English menu" },
  },
  {
    dial: "splurge",
    prompt: "When the bill comes, you'd rather…",
    left: { label: "Feel clever about it", sub: "Great value is half the fun" },
    right: { label: "Not even look", sub: "Splurge on what's worth it" },
  },
  {
    dial: "modern",
    prompt: "Pick the vibe:",
    left: { label: "Old-school classic", sub: "Velvet booths, 80-year-old recipes" },
    right: { label: "New and modern", sub: "Open kitchen, fresh ideas" },
  },
];
