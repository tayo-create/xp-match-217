import { IMG } from "@/lib/images";
import type { Review, TasteProfile } from "@/lib/types";

const DAY = 86_400_000;
const now = Date.now();

/** Used when the traveler skips onboarding, so every match still has a profile to score against. */
export const DEFAULT_PROFILE: TasteProfile = {
  name: "Traveler",
  blend: { curator: 55, drifter: 30, trailblazer: 10, architect: 5 },
  categories: { eat: 92, do: 71, stay: 64, move: 48 },
  likes: ["dry-aged", "steak", "hidden-viewpoint", "slow", "chef-driven", "portuguese", "natural-wine", "museum"],
  dislikes: [],
  budget: 2,
  summary:
    "You seek authentic experiences, great food, and culture with a sense of ease. You appreciate thoughtful design, local flavors, and places with a story.",
  source: "default",
  createdAt: now,
};

const r = (
  id: string,
  placeId: string,
  reviewer: Review["reviewer"],
  rating: number,
  title: string,
  body: string,
  tags: string[],
  helpful: number,
  daysAgo: number,
  photo?: string,
): Review => ({ id, placeId, reviewer, rating, title, body, tags, helpful, createdAt: now - daysAgo * DAY, photo });

const maya = { name: "Maya O.", avatar: IMG.maya, blend: { curator: 58, drifter: 26, trailblazer: 10, architect: 6 }, likes: ["dry-aged", "steak", "museum", "hidden-viewpoint", "natural-wine", "portuguese"] };
const diego = { name: "Diego R.", avatar: IMG.diego, blend: { curator: 40, drifter: 18, trailblazer: 34, architect: 8 }, likes: ["hidden-gem", "local-favorite", "steak", "fado"] };
const hana = { name: "Hana S.", avatar: IMG.hana, blend: { curator: 48, drifter: 40, trailblazer: 4, architect: 8 }, likes: ["design", "boutique", "slow", "garden"] };
const arjun = { name: "Arjun M.", avatar: IMG.arjun, blend: { curator: 24, drifter: 6, trailblazer: 18, architect: 52 }, likes: ["steak", "iconic", "chef-driven"] };
const lena = { name: "Lena V.", avatar: IMG.lena, blend: { curator: 8, drifter: 12, trailblazer: 70, architect: 10 }, likes: ["adventure", "social", "nightlife"] };
const tom = { name: "Tom W.", avatar: IMG.tom, blend: { curator: 26, drifter: 60, trailblazer: 4, architect: 10 }, likes: ["steak", "cozy", "slow"] };
const kev = { name: "Kevin P.", blend: { curator: 5, drifter: 15, trailblazer: 60, architect: 20 }, likes: ["social", "street-food"] };
const sofia = { name: "Sofia L.", blend: { curator: 30, drifter: 20, trailblazer: 10, architect: 40 }, likes: ["iconic"] };

export const SEED_REVIEWS: Review[] = [
  r("r1", "avillez", maya, 5, "Best ribeye in Lisbon", "The ribeye was perfectly aged and seared, and the room is small enough that it feels like a dinner party. Book the 12:30 slot — quieter and the light is gorgeous.", ["Great steak", "Worth the price", "Cozy"], 24, 3, IMG.steak),
  r("r2", "avillez", diego, 4, "Cozy, book ahead", "Inventive without being fussy. The 'Exploding' olives are fun, but the meat dishes are the real reason to come. Could not get in without a reservation.", ["Book ahead", "Local favorite"], 16, 9),
  r("r3", "avillez", kev, 3, "Fine but quiet", "Food was good, but honestly a bit too calm for me. I'd rather be at Time Out Market with a crowd.", ["Quiet"], 4, 14),
  r("r4", "avillez", sofia, 5, "Flawless service", "Everything ran like clockwork, from seating to the bill. Exactly what you want from a chef's restaurant.", ["Great service"], 9, 20),
  r("r5", "taberna", hana, 5, "The chalkboard is the menu", "Arrive at opening, point at whatever is on the board, and trust them. The tuna and the pork cheeks were stunning.", ["Hidden gem", "Cozy", "Worth the wait"], 31, 5, IMG.taberna),
  r("r6", "taberna", tom, 5, "A long lunch kind of place", "We stayed three hours. Nobody rushed us. House wine is lovely.", ["Cozy", "Great value"], 12, 11),
  r("r7", "taberna", lena, 3, "Tiny and slow", "Food was tasty, but the wait was long and there's no buzz. Fine if you're not in a hurry.", ["Slow service"], 3, 18),
  r("r8", "talho", arjun, 5, "A serious steak program", "Pick your cut at the butcher counter, then they cook it exactly right. 45-day dry-aged sirloin was the best I've had in Europe.", ["Great steak", "Worth the price"], 22, 6, IMG.steak),
  r("r9", "talho", maya, 5, "Dry-aged heaven", "If you care about steak, go. Simple sides, precise cooking.", ["Great steak"], 14, 8),
  r("r10", "timeout", lena, 5, "Eat everything", "Ten stalls, one table, new friends. The prego is a must.", ["Social", "Great value"], 19, 4, IMG.foodhall),
  r("r11", "timeout", hana, 2, "Too hectic for me", "Loud and touristy at lunch. Good food, but I couldn't relax.", ["Crowded"], 7, 12),
  r("r12", "miradouro", tom, 5, "Golden hour, bring wine", "Go 40 minutes before sunset, grab a spot on the wall and watch the roofs turn orange.", ["Best at sunset", "Free"], 28, 2, IMG.miradouro),
  r("r13", "miradouro", diego, 4, "Lovely, a bit busy", "Beautiful, but Senhora do Monte up the hill is quieter.", ["Busy"], 10, 10),
  r("r14", "pasteis", sofia, 5, "Worth the queue", "Queue moves fast. Eat them warm with cinnamon at the counter.", ["Iconic", "Great value"], 33, 7, IMG.pasteis),
  r("r15", "fado", diego, 5, "Goosebumps", "Tiny room, candles, a voice that silences everyone. Get there before 9.", ["Live music", "Local favorite"], 17, 15, IMG.fado),
  r("r16", "gulbenkian", hana, 5, "My favorite garden in Europe", "Spent the whole morning by the pond. The collection is world-class too.", ["Peaceful", "Design"], 21, 4, IMG.gulbenkian),
  r("r17", "sintra", lena, 5, "E-bike was the right call", "The hills are brutal on foot. With the e-bike we saw Pena, the Moorish Castle and the forest in one go.", ["Adventure", "Day trip"], 15, 9, IMG.sintra),
  r("r18", "memmo", hana, 5, "That terrace", "Quiet, beautifully designed, and the pool view over Alfama is everything.", ["Design", "Quiet"], 13, 22, IMG.hotel),
];
