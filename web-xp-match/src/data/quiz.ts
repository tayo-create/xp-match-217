import { STYLE_ROUND } from "@/data/styleRound";
import type { Blend, CategoryScores, StyleDials } from "@/lib/types";

export interface QuizOption {
  id: string;
  label: string;
  sub?: string;
  pts?: Partial<Blend>;
  cat?: Partial<CategoryScores>;
  likes?: string[];
  budget?: number;
  dial?: Partial<StyleDials>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  kicker: string;
  multi?: boolean;
  /** Multi-select with like (one tap) and love (two taps). */
  loveable?: boolean;
  /** This-or-that layout. */
  versus?: boolean;
  options: QuizOption[];
}

const STYLE_QUESTIONS: QuizQuestion[] = STYLE_ROUND.map((q) => ({
  id: `style-${q.dial}`,
  kicker: "This or that",
  prompt: q.prompt,
  versus: true,
  options: [
    { id: "a", label: q.left.label, sub: q.left.sub, dial: { [q.dial]: 12 } },
    { id: "b", label: q.right.label, sub: q.right.sub, dial: { [q.dial]: 88 } },
    { id: "c", label: "Either works", dial: { [q.dial]: 50 } },
  ],
}));

export const QUIZ: QuizQuestion[] = [
  {
    id: "first-night",
    kicker: "Arrival",
    prompt: "It's your first evening in a new city. You…",
    options: [
      { id: "a", label: "Find the liveliest spot and make friends", pts: { trailblazer: 3 }, likes: ["social", "nightlife"] },
      { id: "b", label: "Walk to the dinner I booked weeks ago", pts: { architect: 3 }, cat: { eat: 4 } },
      { id: "c", label: "Hunt down the tiny place locals swear by", pts: { curator: 3 }, likes: ["hidden-gem", "local-favorite"] },
      { id: "d", label: "Wander, grab a glass of wine, see where it goes", pts: { drifter: 3 }, likes: ["cozy"] },
    ],
  },
  {
    id: "morning",
    kicker: "Mornings",
    prompt: "Your ideal travel morning looks like…",
    options: [
      { id: "a", label: "A sunrise hike or surf session", pts: { trailblazer: 3 }, likes: ["active", "adventure"], cat: { do: 6 } },
      { id: "b", label: "First in line when the museum opens", pts: { architect: 2, curator: 1 }, likes: ["museum"] },
      { id: "c", label: "Specialty coffee and a good book", pts: { drifter: 3 }, likes: ["slow", "breakfast"] },
      { id: "d", label: "A market crawl, tasting everything", pts: { curator: 2, trailblazer: 1 }, likes: ["market", "street-food"], cat: { eat: 5 } },
    ],
  },
  {
    id: "planning",
    kicker: "Planning",
    prompt: "How planned is your trip?",
    options: [
      { id: "a", label: "Every hour mapped out", pts: { architect: 3 }, cat: { move: 12 } },
      { id: "b", label: "A few anchors, the rest open", pts: { curator: 2, drifter: 1 } },
      { id: "c", label: "Flights and a bed, that's it", pts: { drifter: 2, trailblazer: 1 }, cat: { move: -6 } },
      { id: "d", label: "Plan? I'll figure it out there", pts: { trailblazer: 3 } },
    ],
  },
  {
    id: "dinner",
    kicker: "Eat",
    prompt: "Pick tonight's dinner.",
    options: [
      { id: "a", label: "Dry-aged steak at a serious steakhouse", pts: { curator: 1, architect: 1 }, likes: ["steak", "dry-aged", "meat"] },
      { id: "b", label: "A tasting menu at the chef's counter", pts: { curator: 3 }, likes: ["chef-driven"], cat: { eat: 6 } },
      { id: "c", label: "Street food and plastic stools", pts: { trailblazer: 3 }, likes: ["street-food"] },
      { id: "d", label: "A grandma-run tasca with house wine", pts: { drifter: 3 }, likes: ["cozy", "local-favorite"] },
    ],
  },
  {
    id: "stay",
    kicker: "Stay",
    prompt: "Where do you want to sleep?",
    options: [
      { id: "a", label: "A boutique stay with design and a story", pts: { curator: 2 }, likes: ["boutique", "design"], cat: { stay: 10 } },
      { id: "b", label: "A social hotel with a rooftop scene", pts: { trailblazer: 3 }, likes: ["rooftop", "social"] },
      { id: "c", label: "Central, reliable, great reviews", pts: { architect: 3 } },
      { id: "d", label: "Quiet room, big bed, late checkout", pts: { drifter: 3 }, likes: ["quiet"], cat: { stay: 12 } },
    ],
  },
  {
    id: "move",
    kicker: "Getting around",
    prompt: "How do you like to get around?",
    options: [
      { id: "a", label: "Rent an e-bike or scooter", pts: { trailblazer: 3 }, likes: ["active"], cat: { move: 8 } },
      { id: "b", label: "Fastest route, pre-booked transfers", pts: { architect: 3 }, cat: { move: 18 } },
      { id: "c", label: "Vintage trams and scenic trains", pts: { drifter: 2, curator: 1 }, likes: ["tram", "scenic-route"] },
      { id: "d", label: "On foot — the best way to see a city", pts: { curator: 2, drifter: 1 }, likes: ["city-walks"], cat: { move: -10 } },
    ],
  },
  {
    id: "afternoon",
    kicker: "Do",
    prompt: "Pick your afternoon.",
    options: [
      { id: "a", label: "A hidden viewpoint at golden hour", pts: { drifter: 2, curator: 1 }, likes: ["hidden-viewpoint", "viewpoint", "sunset", "photography"] },
      { id: "b", label: "A day trip to a hilltop palace", pts: { architect: 2, curator: 1 }, likes: ["palace", "day-trip", "history"] },
      { id: "c", label: "A gallery, then its garden", pts: { curator: 3 }, likes: ["museum", "art", "garden"] },
      { id: "d", label: "A surf lesson or a cliff walk", pts: { trailblazer: 3 }, likes: ["adventure", "active"], cat: { do: 8 } },
    ],
  },
  {
    id: "night",
    kicker: "After dark",
    prompt: "After dinner, you're most likely…",
    options: [
      { id: "a", label: "Sipping cocktails on a rooftop", pts: { trailblazer: 2, drifter: 1 }, likes: ["rooftop", "cocktails"] },
      { id: "b", label: "Listening to live music in a tiny room", pts: { curator: 2, trailblazer: 1 }, likes: ["live-music", "fado"] },
      { id: "c", label: "At a natural-wine bar, chatting to the owner", pts: { curator: 2, drifter: 1 }, likes: ["natural-wine", "wine"] },
      { id: "d", label: "In bed — big day tomorrow", pts: { architect: 3 } },
    ],
  },
  {
    id: "food-weight",
    kicker: "Priorities",
    prompt: "How much does food steer your trips?",
    options: [
      { id: "a", label: "I plan trips around restaurants", pts: { curator: 2 }, cat: { eat: 14 } },
      { id: "b", label: "Important, but not everything", pts: { architect: 1, drifter: 1 } },
      { id: "c", label: "It's fuel — the trip is the activities", pts: { trailblazer: 2 }, cat: { eat: -18, do: 10 } },
      { id: "d", label: "Long lunches ARE the trip", pts: { drifter: 2 }, cat: { eat: 8, do: -6 } },
    ],
  },
  {
    id: "budget",
    kicker: "Budget",
    prompt: "What's your spending style?",
    options: [
      { id: "a", label: "Smart and thrifty", sub: "Great value beats fancy", budget: 1 },
      { id: "b", label: "Spend where it counts", sub: "Splurge on a few highlights", budget: 2 },
      { id: "c", label: "Treat myself", sub: "It's a holiday, after all", budget: 3, cat: { stay: 6 } },
    ],
  },
  {
    id: "friends",
    kicker: "You",
    prompt: "Your travel friends would call you…",
    options: [
      { id: "a", label: "The one who makes plans happen", pts: { architect: 3 } },
      { id: "b", label: "The one who finds the best spots", pts: { curator: 3 } },
      { id: "c", label: "The one who talks to strangers", pts: { trailblazer: 3 } },
      { id: "d", label: "The one everyone relaxes around", pts: { drifter: 3 } },
    ],
  },
  {
    id: "loves",
    kicker: "Your tastes",
    prompt: "What do you love? Tap once to like, twice to love.",
    multi: true,
    loveable: true,
    options: [
      { id: "steak", label: "Dry-aged steak", likes: ["steak", "dry-aged"] },
      { id: "seafood", label: "Seafood", likes: ["seafood"] },
      { id: "chef", label: "Chef-driven kitchens", likes: ["chef-driven"] },
      { id: "street", label: "Street food", likes: ["street-food"] },
      { id: "pastry", label: "Pastries & coffee", likes: ["pastry", "breakfast"] },
      { id: "wine", label: "Natural wine", likes: ["natural-wine", "wine"] },
      { id: "cocktails", label: "Cocktail bars", likes: ["cocktails"] },
      { id: "views", label: "Hidden viewpoints", likes: ["hidden-viewpoint", "viewpoint"] },
      { id: "museums", label: "Museums & art", likes: ["museum", "art"] },
      { id: "history", label: "History", likes: ["history"] },
      { id: "music", label: "Live music", likes: ["live-music"] },
      { id: "nightlife", label: "Nightlife", likes: ["nightlife"] },
      { id: "outdoors", label: "Outdoor adventure", likes: ["adventure", "active"] },
      { id: "design", label: "Design hotels", likes: ["design", "boutique"] },
      { id: "slow", label: "Slow mornings", likes: ["slow"] },
      { id: "photo", label: "Photography", likes: ["photography"] },
      { id: "hidden", label: "Hidden gems", likes: ["hidden-gem", "local-favorite"] },
      { id: "ramen", label: "Ramen & noodles", likes: ["ramen"] },
      { id: "markets", label: "Food markets", likes: ["market", "food-hall"] },
      { id: "gardens", label: "Gardens", likes: ["garden"] },
    ],
  },
  ...STYLE_QUESTIONS,
];
