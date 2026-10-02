export type TypeId = "curator" | "drifter" | "trailblazer" | "architect";
export type CategoryId = "eat" | "do" | "stay" | "move";
export type PlaceKind = "eat" | "do" | "stay" | "nightlife" | "move";

export type Blend = Record<TypeId, number>;
export type CategoryScores = Record<CategoryId, number>;

/** The five style dials from the this-or-that round, each 0–100. */
export type DialId = "refined" | "buzz" | "local" | "splurge" | "modern";
export type StyleDials = Record<DialId, number>;

/** A traveler's taste profile: archetype blend + per-category coefficients + specific tastes. */
export interface TasteProfile {
  name: string;
  blend: Blend;
  categories: CategoryScores;
  likes: string[];
  /** Tags tapped twice ("love"): weigh fully in interest fit. */
  loves?: string[];
  dislikes: string[];
  /** Style dials; estimated from the blend until the style round is answered. */
  dials?: StyleDials;
  dialsSource?: "quiz" | "default";
  /** 1 = value, 2 = mid-range, 3 = treat myself */
  budget: number;
  summary: string;
  source: "quiz" | "interview" | "default";
  createdAt: number;
}

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  cuisine?: string;
  neighborhood: string;
  city: string;
  price: number;
  blurb: string;
  tags: string[];
  affinity: Blend;
  lat: number;
  lng: number;
  image?: string;
  custom?: boolean;
}

export interface MatchResult {
  score: number;
  reasons: string[];
  dominantType: TypeId;
}

export interface Traveler {
  id: string;
  /** Full taste profile, when the traveler shared one. */
  profile?: TasteProfile;
  name: string;
  home: string;
  avatar: string;
  bio: string;
  blend: Blend;
  categories: CategoryScores;
  likes: string[];
  interests: string[];
  savedPlaceIds: string[];
  upcoming: string;
}

export interface ItineraryItem {
  id: string;
  time: string;
  place: Place;
  note?: string;
  /** When the stop was placed; drives the "new" highlight. */
  addedAt?: number;
  /** Display label of who added it, e.g. "XP" or "Maya". */
  addedBy?: string;
  /** "xp" for the concierge, otherwise the adding device's client id. */
  addedById?: string;
}

export type InterestId = "foodie" | "adventure" | "relaxing" | "culture" | "nightlife" | "hidden-gems" | "romantic" | "outdoors";
export type TripPace = "relaxed" | "balanced" | "packed";

/** Per-trip preferences that steer the concierge's future picks. */
export interface TripSettings {
  interests: InterestId[];
  pace: TripPace;
  notes: string;
}

export interface TripDay {
  items: ItineraryItem[];
}

export interface Trip {
  id: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  cover: string;
  blurb: string;
  center: [number, number];
  days: TripDay[];
}

export interface ChatPickMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  picks?: Place[];
  suggestions?: string[];
  createdAt: number;
  error?: boolean;
  /** Stops the concierge placed on this chat's trip with this reply. */
  planned?: PlannedUpdate;
  /** User (or device) id of whoever sent a user message (for shared trip chats). */
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  /** A message to the other people on the trip; XP doesn't reply to it. */
  toGroup?: boolean;
}

export interface PlannedUpdate {
  tripId: string;
  created: boolean;
  items: { placeId: string; name: string; day: number; time?: string }[];
  undone?: boolean;
}

export interface ConciergeChat {
  id: string;
  title: string;
  subtitle: string;
  cover: string;
  tripId?: string;
  messages: ChatPickMessage[];
  updatedAt: number;
  pinned?: boolean;
  /** True once the user renamed the chat; stops auto-titling. */
  titleLocked?: boolean;
  /** Auto-build the linked itinerary from picks. Defaults to on. */
  autoPlan?: boolean;
  settings?: TripSettings;
  /** Live collaboration room id; set once the chat is shared with others. */
  roomId?: string;
  /** Last room version this device applied. */
  roomVersion?: number;
  /** Stops added after this moment (by XP or collaborators) are highlighted as new. */
  seenAt?: number;
}

/** How a visit felt; places are ranked inside each tier. */
export type ListTier = "loved" | "liked" | "meh";

/** A place the user has been to, with their rating and memories. One log per place (id = place id). */
export interface PlaceLog {
  id: string;
  place: Place;
  tier: ListTier;
  visitedOn?: string;
  /** Uploaded photo paths ("/feed/photo/...") or small data URLs when signed out. */
  photos: string[];
  /** Favorite dishes, drinks or highlights. */
  favorites: string[];
  with: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  /** Feed post that shares this log, once posted. */
  postId?: string;
}

export interface DirectMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: number;
}

export interface Thread {
  travelerId: string;
  messages: DirectMessage[];
  unread: number;
  otherName?: string;
  otherAvatar?: string;
  pending?: boolean;
}

export interface Reviewer {
  name: string;
  avatar?: string;
  blend: Blend;
  likes: string[];
  travelerId?: string;
}

export interface Review {
  id: string;
  placeId: string;
  reviewer: Reviewer;
  rating: number;
  title: string;
  body: string;
  tags: string[];
  photo?: string;
  helpful: number;
  createdAt: number;
  mine?: boolean;
}
