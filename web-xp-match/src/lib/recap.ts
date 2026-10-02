import { placeImage } from "@/data/places";
import { type FeedPost, placeFromSnap } from "@/lib/feed";
import { photoSrc } from "@/lib/photos";
import type { ListTier, PlaceLog, Trip } from "@/lib/types";

/** One beat of a trip recap: a stop with its photo and what the traveler thought of it. */
export interface RecapSlide {
  id: string;
  image: string;
  /** Used when the photo can't be drawn (e.g. a cross-origin image during video export). */
  fallback: string;
  kicker: string;
  title: string;
  caption?: string;
  score?: number;
  tier?: ListTier;
  dishes: string[];
  /** True when the photo was taken by the traveler (vs. a stock place image). */
  own: boolean;
}

export interface RecapStats {
  days: number;
  stops: number;
  rated: number;
  avg?: number;
  best?: { name: string; score: number };
}

/** Everything the recap player and the video renderer need. */
export interface RecapData {
  id: string;
  city: string;
  title: string;
  dates: string;
  author?: string;
  cover: string;
  slides: RecapSlide[];
  route: { lat: number; lng: number; day: number }[];
  stats: RecapStats;
}

const MAX_SLIDES = 24;

const dayLabel = (startDate: string, i: number): string => {
  if (!startDate) return `Day ${i + 1}`;
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + i);
  return `Day ${i + 1} · ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
};

const rangeLabel = (start: string, end: string): string => {
  if (!start) return "";
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${(end || start)}T00:00:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return s.getMonth() === e.getMonth() ? `${m(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}` : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}, ${e.getFullYear()}`;
};

const timeLabel = (t: string): string => {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return t;
  const ap = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${ap}` : `${hh}${ap}`;
};

const statsOf = (days: number, slides: RecapSlide[]): RecapStats => {
  const stopSlides = slides.filter((s) => !s.id.includes(":more"));
  const rated = stopSlides.filter((s) => typeof s.score === "number");
  const best = [...rated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  return {
    days,
    stops: stopSlides.length,
    rated: rated.length,
    avg: rated.length ? Math.round((rated.reduce((s, r) => s + (r.score ?? 0), 0) / rated.length) * 10) / 10 : undefined,
    best: best ? { name: best.title, score: best.score ?? 0 } : undefined,
  };
};

/**
 * Recap of my own trip: each stop in time order, using my photos and ratings from the list
 * where I have them, and the place image otherwise.
 */
export function recapFromTrip(trip: Trip, logFor: (placeId: string) => { log: PlaceLog; score: number } | undefined, author?: string): RecapData {
  const slides: RecapSlide[] = [];
  const route: RecapData["route"] = [];
  trip.days.forEach((d, di) => {
    [...d.items]
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((it) => {
        const r = logFor(it.place.id);
        const photos = (r?.log.photos ?? []).map(photoSrc);
        const fallback = placeImage(it.place);
        route.push({ lat: it.place.lat, lng: it.place.lng, day: di });
        slides.push({
          id: it.id,
          image: photos[0] ?? fallback,
          fallback,
          kicker: `${dayLabel(trip.startDate, di)} · ${timeLabel(it.time)}`,
          title: it.place.name,
          caption: r?.log.note || it.note || undefined,
          score: r?.score,
          tier: r?.log.tier,
          dishes: r?.log.favorites.slice(0, 3) ?? [],
          own: Boolean(photos[0]),
        });
        // A second photo of a stop gets its own quick beat.
        if (photos[1]) slides.push({ id: `${it.id}:more`, image: photos[1], fallback, kicker: dayLabel(trip.startDate, di), title: it.place.name, dishes: [], own: true });
      });
  });
  const ownCover = slides.find((s) => s.own)?.image;
  return {
    id: trip.id,
    city: trip.city,
    title: `${trip.days.length} ${trip.days.length === 1 ? "day" : "days"} in ${trip.city}`,
    dates: rangeLabel(trip.startDate, trip.endDate),
    author,
    cover: ownCover ?? trip.cover,
    slides: slides.slice(0, MAX_SLIDES),
    route,
    stats: statsOf(trip.days.length, slides),
  };
}

/** Recap of a trip someone shared on the feed. Their attached photos become "moments". */
export function recapFromPost(post: FeedPost): RecapData {
  const trip = post.trip;
  const slides: RecapSlide[] = [];
  const route: RecapData["route"] = [];
  (trip?.days ?? []).forEach((d, di) =>
    [...d.items]
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((it, j) => {
        const place = placeFromSnap(it.place);
        const img = placeImage(place);
        route.push({ lat: place.lat, lng: place.lng, day: di });
        slides.push({ id: `${post.id}-${di}-${j}`, image: img, fallback: img, kicker: `${dayLabel(trip?.startDate ?? "", di)} · ${timeLabel(it.time)}`, title: place.name, caption: it.note, dishes: [], own: false });
      }),
  );
  post.photos.slice(0, 6).forEach((p, i) => {
    const at = Math.min(slides.length, Math.round(((i + 1) * slides.length) / (Math.min(post.photos.length, 6) + 1)));
    slides.splice(at, 0, { id: `${post.id}-m${i}`, image: photoSrc(p), fallback: trip?.cover ?? "", kicker: "Moments", title: trip?.city ?? "", dishes: [], own: true });
  });
  const cover = post.photos[0] ? photoSrc(post.photos[0]) : trip?.cover || slides[0]?.image || "";
  return {
    id: post.id,
    city: trip?.city ?? "",
    title: post.title || `${trip?.days.length ?? 0} days in ${trip?.city ?? ""}`,
    dates: rangeLabel(trip?.startDate ?? "", trip?.endDate ?? ""),
    author: post.name,
    cover,
    slides: slides.slice(0, MAX_SLIDES),
    route,
    stats: statsOf(trip?.days.length ?? 0, slides.filter((s) => s.kicker !== "Moments")),
  };
}

/** Recap timing (ms). */
export const RECAP_TIMING = { intro: 3400, slide: 3800, outro: 5200, fade: 450 } as const;

export const recapDuration = (d: RecapData): number => RECAP_TIMING.intro + d.slides.length * RECAP_TIMING.slide + RECAP_TIMING.outro;

/** Projects route points into a box, keeping aspect ratio. */
export function projectRoute(route: RecapData["route"], w: number, h: number, pad: number): { x: number; y: number; day: number }[] {
  if (!route.length) return [];
  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const xs = route.map((p) => p.lng * Math.cos(midLat));
  const ys = route.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1e-6, Math.max(...xs) - minX);
  const spanY = Math.max(1e-6, Math.max(...ys) - minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return route.map((p, i) => ({ x: offX + (xs[i] - minX) * scale, y: offY + (ys[i] - minY) * scale, day: p.day }));
}

export const RECAP_MUSIC = "https://owovc8n3uuz2cawhtmbuc.rork.app/~assets/aud/b9a9631b-5e40-45ed-bc59-a5c3669adceb.mp3";

export const DAY_COLORS = ["#C8452D", "#1F2A44", "#5E9C7C", "#D9A43A", "#E08A6A", "#4A6FA5", "#8C5A9E", "#2E8C8C"];
