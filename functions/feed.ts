import { DurableObject } from "cloudflare:workers";

import { json, kvDelete, kvGet, kvInit, kvList, kvPut, randomToken, readBody, smallObject, str, type Sql } from "./storage";

type Tier = "loved" | "liked" | "meh";

interface PlaceSnap {
  id: string;
  name: string;
  kind: string;
  city: string;
  neighborhood: string;
  cuisine?: string;
  price: number;
  image?: string;
  tags: string[];
  lat: number;
  lng: number;
  blurb: string;
  custom?: boolean;
}

interface TripSnap {
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  cover: string;
  days: { items: { time: string; place: PlaceSnap; note?: string }[] }[];
}

/** One post in the community feed: a rated place ("log") or a whole trip ("trip"). */
interface Post {
  id: string;
  type: "log" | "trip";
  userId: string;
  name: string;
  avatar: string;
  createdAt: number;
  title: string;
  note: string;
  place?: PlaceSnap;
  tier?: Tier;
  score?: number;
  visitedOn?: string;
  dishes: string[];
  with: string[];
  photos: string[];
  trip?: TripSnap;
  likes: string[];
  copiedBy: string[];
  /** The poster's taste snapshot (blend, categories, likes, dials) used for compatibility scores. */
  taste?: Record<string, unknown>;
  /** People who reported the post. Three reports hide it until reviewed. */
  reports?: string[];
  hidden?: boolean;
}

const HIDE_AT = 3;

const MAX_POSTS = 2000;
const MAX_PHOTOS = 4;
const PHOTO_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIERS: Tier[] = ["loved", "liked", "meh"];

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, maxLen)).slice(0, maxItems) : [];

const safeUrl = (v: unknown): string => {
  const s = str(v, 500);
  return s.startsWith("https://") || s.startsWith("/feed/photo/") || s.startsWith("/~api/feed/photo/") ? s : "";
};

const cleanPlace = (raw: unknown): PlaceSnap | null => {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = str(p.id, 80);
  const name = str(p.name, 120);
  if (!id || !name) return null;
  return {
    id,
    name,
    kind: str(p.kind, 20) || "do",
    city: str(p.city, 60),
    neighborhood: str(p.neighborhood, 80),
    cuisine: str(p.cuisine, 40) || undefined,
    price: num(p.price, 0, 4, 2),
    image: safeUrl(p.image) || undefined,
    tags: strList(p.tags, 12, 30),
    lat: num(p.lat, -90, 90, 0),
    lng: num(p.lng, -180, 180, 0),
    blurb: str(p.blurb, 400),
    custom: p.custom === true || undefined,
  };
};

const cleanTrip = (raw: unknown): TripSnap | null => {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const days = Array.isArray(t.days) ? t.days.slice(0, 30) : [];
  const out: TripSnap = {
    city: str(t.city, 60),
    country: str(t.country, 60),
    startDate: DATE_RE.test(str(t.startDate, 10)) ? str(t.startDate, 10) : "",
    endDate: DATE_RE.test(str(t.endDate, 10)) ? str(t.endDate, 10) : "",
    cover: safeUrl(t.cover),
    days: days.map((d) => {
      const items = d && typeof d === "object" && Array.isArray((d as { items?: unknown }).items) ? ((d as { items: unknown[] }).items).slice(0, 12) : [];
      return {
        items: items
          .map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            const place = cleanPlace(o.place);
            return place ? { time: str(o.time, 5) || "12:00", place, note: str(o.note, 200) || undefined } : null;
          })
          .filter((x): x is { time: string; place: PlaceSnap; note: string | undefined } => x !== null),
      };
    }),
  };
  return out.city && out.days.some((d) => d.items.length) ? out : null;
};

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Single global instance: the community feed of rated places and shared trips, plus their photos. */
export class Feed extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  private all(): Post[] {
    return kvList<Post>(this.sql, "p:", MAX_POSTS + 50).sort((a, b) => b.createdAt - a.createdAt);
  }

  private visible(): Post[] {
    return this.all().filter((p) => !p.hidden);
  }

  private removePost(post: Post): void {
    kvDelete(this.sql, `p:${post.id}`);
    for (let i = 0; i < post.photos.length; i++) kvDelete(this.sql, `ph:${post.id}:${i}`);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // feed, [places|photo|:id], ...
    const m = request.method;
    const userId = request.headers.get("X-Rork-User-Id");

    if (parts[1] === "photo" && parts[2] && parts[3] && m === "GET") {
      const rec = kvGet<{ type: string; b64: string }>(this.sql, `ph:${parts[2]}:${parts[3]}`);
      if (!rec) return new Response("Not found", { status: 404 });
      return new Response(b64ToBytes(rec.b64), { headers: { "Content-Type": rec.type, "Cache-Control": "public, max-age=31536000, immutable" } });
    }

    // Internal (called by the worker only): moderation removal and account deletion.
    if (parts[0] === "internal") {
      if (parts[1] === "remove" && parts[2] && m === "POST") {
        const post = kvGet<Post>(this.sql, `p:${parts[2]}`);
        if (post) this.removePost(post);
        return json({ ok: true, removed: Boolean(post) });
      }
      if (parts[1] === "restore" && parts[2] && m === "POST") {
        const post = kvGet<Post>(this.sql, `p:${parts[2]}`);
        if (post) kvPut(this.sql, `p:${post.id}`, { ...post, hidden: false, reports: [] });
        return json({ ok: true });
      }
      if (parts[1] === "purge" && m === "POST" && userId) {
        const mine = this.all().filter((p) => p.userId === userId);
        mine.forEach((p) => this.removePost(p));
        this.sql.exec("DELETE FROM kv WHERE k >= 'ph:u:' AND k < 'ph:u:\uffff' AND json_extract(v, '$.userId') = ?", userId);
        return json({ ok: true, posts: mine.length });
      }
      return json({ error: "Not found" }, 404);
    }

    if (parts.length === 1 && m === "GET") {
      const only = url.searchParams.get("user");
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 120));
      const posts = this.visible()
        .filter((p) => !only || p.userId === only)
        .slice(0, limit)
        .map(({ reports, ...p }) => ({ ...p, reportCount: reports?.length ?? 0 }));
      return json({ posts });
    }

    // Community scores: each person's latest rating of a place counts once.
    if (parts[1] === "places" && m === "GET") {
      const latest = new Map<string, Post>();
      for (const p of this.visible()) {
        if (p.type !== "log" || !p.place || typeof p.score !== "number") continue;
        const k = `${p.userId}|${p.place.id}`;
        if (!latest.has(k)) latest.set(k, p);
      }
      const stats: Record<string, { sum: number; count: number; loved: number; name: string }> = {};
      for (const p of latest.values()) {
        const s = (stats[p.place!.id] ??= { sum: 0, count: 0, loved: 0, name: p.place!.name });
        s.sum += p.score!;
        s.count += 1;
        if (p.tier === "loved") s.loved += 1;
      }
      const places = Object.fromEntries(
        Object.entries(stats).map(([id, s]) => [id, { avg: Math.round((s.sum / s.count) * 10) / 10, count: s.count, loved: s.loved, name: s.name }]),
      );
      return json({ places });
    }

    if (!userId) return json({ error: "Sign in to post and react." }, 401);

    // Photo uploads for place logs: stored once, referenced by URL from logs and posts.
    if (parts[1] === "upload" && m === "POST") {
      const body = await readBody<{ photo?: string }>(request, 900_000);
      const match = typeof body?.photo === "string" ? PHOTO_RE.exec(body.photo) : null;
      if (!match || match[2].length > 800_000) return json({ error: "That photo is too large or not an image." }, 400);
      const token = randomToken(20);
      kvPut(this.sql, `ph:u:${token}`, { type: match[1], b64: match[2], userId, at: Date.now() });
      return json({ url: `/feed/photo/u/${token}` });
    }

    if (parts.length === 1 && m === "POST") {
      const body = await readBody<Record<string, unknown>>(request);
      if (!body) return json({ error: "That post is too large. Try fewer photos." }, 413);
      const type = body.type === "trip" ? "trip" : "log";
      const id = `post-${randomToken(14)}`;
      const base = {
        id,
        type,
        userId,
        name: str(body.name, 40) || str(request.headers.get("X-Rork-User-Name"), 40) || "Traveler",
        avatar: str(body.avatar, 400),
        createdAt: Date.now(),
        title: str(body.title, 120),
        note: str(body.note, 1200),
        dishes: strList(body.dishes, 10, 60),
        with: strList(body.with, 10, 40),
        likes: [] as string[],
        copiedBy: [] as string[],
        taste: smallObject(body.taste, 4_000) ?? undefined,
      };

      let post: Post;
      if (type === "log") {
        const place = cleanPlace(body.place);
        const tier = TIERS.includes(body.tier as Tier) ? (body.tier as Tier) : undefined;
        if (!place || !tier) return json({ error: "Pick a place and a rating first." }, 400);
        const photos: string[] = [];
        const raw = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
        raw.forEach((p) => {
          if (typeof p === "string" && p.startsWith("/feed/photo/")) photos.push(p);
          const match = typeof p === "string" ? PHOTO_RE.exec(p) : null;
          if (!match || match[2].length > 600_000) return;
          kvPut(this.sql, `ph:${id}:${photos.length}`, { type: match[1], b64: match[2] });
          photos.push(`/feed/photo/${id}/${photos.length}`);
        });
        post = {
          ...base,
          place,
          tier,
          score: num(body.score, 0, 10, tier === "loved" ? 8.5 : tier === "liked" ? 5.5 : 2.5),
          visitedOn: DATE_RE.test(str(body.visitedOn, 10)) ? str(body.visitedOn, 10) : undefined,
          photos,
        };
      } else {
        const trip = cleanTrip(body.trip);
        if (!trip) return json({ error: "Add a few stops to the trip before sharing it." }, 400);
        post = { ...base, trip, photos: strList(body.photos, 6, 500).filter((u) => u.startsWith("/feed/photo/") || u.startsWith("https://")) };
        post.dishes = [];
      }

      // Replacing my own earlier post (e.g. an edited rating) keeps likes and copies.
      const replaceId = str(body.replaceId, 64);
      if (replaceId) {
        const old = kvGet<Post>(this.sql, `p:${replaceId}`);
        if (old && old.userId === userId) {
          post.likes = old.likes;
          post.copiedBy = old.copiedBy;
          post.reports = old.reports;
          post.hidden = old.hidden;
          const keep = new Set(post.photos);
          old.photos.forEach((u, i) => {
            if (!keep.has(u)) kvDelete(this.sql, `ph:${old.id}:${i}`);
          });
          kvDelete(this.sql, `p:${old.id}`);
        }
      }

      kvPut(this.sql, `p:${id}`, post);
      const everything = this.all();
      everything.slice(MAX_POSTS).forEach((p) => this.removePost(p));
      return json({ post });
    }

    const post = parts[1] ? kvGet<Post>(this.sql, `p:${parts[1]}`) : null;
    if (!post) return json({ error: "That post was removed." }, 404);

    if (parts.length === 2 && m === "DELETE") {
      if (post.userId !== userId) return json({ error: "You can only delete your own posts." }, 403);
      this.removePost(post);
      return json({ ok: true });
    }

    if (parts[2] === "like" && m === "POST") {
      const likes = post.likes.includes(userId) ? post.likes.filter((x) => x !== userId) : [...post.likes, userId].slice(-5000);
      const next = { ...post, likes };
      kvPut(this.sql, `p:${post.id}`, next);
      return json({ post: next });
    }

    if (parts[2] === "report" && m === "POST") {
      if (post.userId === userId) return json({ error: "You can delete your own post instead." }, 400);
      const reports = post.reports?.includes(userId) ? post.reports : [...(post.reports ?? []), userId].slice(-200);
      const next = { ...post, reports, hidden: post.hidden || reports.length >= HIDE_AT };
      kvPut(this.sql, `p:${post.id}`, next);
      return json({ ok: true, hidden: next.hidden, reports: reports.length, title: post.title, owner: post.name });
    }

    if (parts[2] === "copy" && m === "POST") {
      if (post.copiedBy.includes(userId) || post.userId === userId) return json({ post });
      const next = { ...post, copiedBy: [...post.copiedBy, userId].slice(-5000) };
      kvPut(this.sql, `p:${post.id}`, next);
      return json({ post: next });
    }

    return json({ error: "Not found" }, 404);
  }
}
