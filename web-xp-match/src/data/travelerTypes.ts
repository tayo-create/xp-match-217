import { IMG } from "@/lib/images";
import type { CategoryId, CategoryScores, TypeId } from "@/lib/types";

export interface TravelerTypeInfo {
  id: TypeId;
  name: string;
  short: string;
  traits: string;
  temperament: string;
  description: string;
  image: string;
  color: string;
  /** How strongly this archetype weighs each category (0–100). */
  weights: CategoryScores;
  /** How this archetype tends to approach each category. */
  styles: Record<CategoryId, string>;
}

export const TYPE_ORDER: TypeId[] = ["curator", "drifter", "trailblazer", "architect"];

export const TRAVELER_TYPES: Record<TypeId, TravelerTypeInfo> = {
  trailblazer: {
    id: "trailblazer",
    name: "The Trailblazer",
    short: "Trailblazer",
    traits: "bold, social, spontaneous",
    temperament: "Sanguine · Promoter",
    description: "You're curious, always looking for what's new and different.",
    image: IMG.typeTrailblazer,
    color: "hsl(var(--type-trailblazer))",
    weights: { eat: 70, do: 92, stay: 40, move: 66 },
    styles: {
      eat: "lively food halls and street food",
      do: "adventure, crowds and new experiences",
      stay: "social hotels close to the action",
      move: "bikes, scooters and whatever's fastest to fun",
    },
  },
  architect: {
    id: "architect",
    name: "The Architect",
    short: "Architect",
    traits: "driven, efficient, ambitious",
    temperament: "Choleric · Controller",
    description: "You appreciate structure, great planning and making the most of your time.",
    image: IMG.typeArchitect,
    color: "hsl(var(--type-architect))",
    weights: { eat: 74, do: 82, stay: 66, move: 82 },
    styles: {
      eat: "top-rated tables booked ahead",
      do: "the essential sights, done efficiently",
      stay: "central, reliable and well-run",
      move: "the quickest route, planned in advance",
    },
  },
  curator: {
    id: "curator",
    name: "The Curator",
    short: "Curator",
    traits: "curious, detailed, discerning",
    temperament: "Melancholic · Analyzer",
    description: "You value culture, food and meaningful, well-crafted experiences.",
    image: IMG.typeCurator,
    color: "hsl(var(--type-curator))",
    weights: { eat: 95, do: 82, stay: 70, move: 46 },
    styles: {
      eat: "chef-driven kitchens and researched local gems",
      do: "museums, history and hidden viewpoints",
      stay: "boutique stays with design and a story",
      move: "scenic routes and walkable neighborhoods",
    },
  },
  drifter: {
    id: "drifter",
    name: "The Drifter",
    short: "Drifter",
    traits: "easygoing, cozy, unhurried",
    temperament: "Phlegmatic · Supporter",
    description: "You like flexibility, spontaneity and going with the flow.",
    image: IMG.typeDrifter,
    color: "hsl(var(--type-drifter))",
    weights: { eat: 86, do: 56, stay: 82, move: 44 },
    styles: {
      eat: "cozy tascas and long lunches",
      do: "slow mornings, gardens and golden-hour views",
      stay: "quiet, comfortable places that feel like home",
      move: "strolling, trams and no rush",
    },
  },
};

export const CATEGORY_INFO: Record<CategoryId, { label: string; blurbHigh: string; blurbMid: string; blurbLow: string }> = {
  eat: {
    label: "Eat",
    blurbHigh: "Extraordinary food is always a reason to visit.",
    blurbMid: "Good food matters, but it doesn't rule the trip.",
    blurbLow: "Food is fuel — the trip is about everything else.",
  },
  do: {
    label: "Do",
    blurbHigh: "You love memorable activities and cultural experiences.",
    blurbMid: "A couple of great experiences a day is your sweet spot.",
    blurbLow: "You'd rather soak it in than tick things off.",
  },
  stay: {
    label: "Stay",
    blurbHigh: "Where you sleep is part of the experience.",
    blurbMid: "You prefer boutique stays with character.",
    blurbLow: "A clean bed in a good location is all you need.",
  },
  move: {
    label: "Getting around",
    blurbHigh: "Efficient routes and smooth transfers matter to you.",
    blurbMid: "You're open to local transit and scenic routes.",
    blurbLow: "Walkable cities and scenic routes — no rush.",
  },
};

export const TAG_LABELS: Record<string, string> = {
  steak: "steak",
  "dry-aged": "dry-aged steak",
  meat: "meat dishes",
  portuguese: "Portuguese cooking",
  "chef-driven": "chef-driven kitchens",
  intimate: "intimate rooms",
  cozy: "cozy spots",
  "local-favorite": "local favorites",
  "hidden-gem": "hidden gems",
  "small-plates": "small plates",
  pastry: "pastries",
  breakfast: "breakfast spots",
  iconic: "iconic classics",
  viewpoint: "viewpoints",
  "hidden-viewpoint": "hidden viewpoints",
  sunset: "sunsets",
  photography: "photography",
  rooftop: "rooftop bars",
  cocktails: "cocktails",
  social: "social scenes",
  nightlife: "nightlife",
  adventure: "adventure",
  active: "active days",
  history: "history",
  "day-trip": "day trips",
  palace: "palaces",
  boutique: "boutique stays",
  design: "design",
  quiet: "quiet stays",
  tram: "old trams",
  "scenic-route": "scenic routes",
  "city-walks": "city walks",
  fado: "fado",
  "live-music": "live music",
  museum: "museums",
  art: "art",
  garden: "gardens",
  slow: "slow mornings",
  "food-hall": "food halls",
  market: "markets",
  "natural-wine": "natural wine",
  wine: "wine bars",
  seafood: "seafood",
  ramen: "ramen",
  "street-food": "street food",
};

export const ALL_TAGS: string[] = Object.keys(TAG_LABELS);

export const tagLabel = (tag: string): string => TAG_LABELS[tag] ?? tag.replace(/-/g, " ");
