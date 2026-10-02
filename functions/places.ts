import { DurableObject } from "cloudflare:workers";

import { json, kvGet, kvInit, kvPut, str, type Sql } from "./storage";

/**
 * City lookup and shared place cache for live places.
 * - GET geocodes a city once (OpenStreetMap Nominatim, plus a Wikidata cover and Wikipedia intro)
 *   and returns any cached places.
 * - PUT stores places a signed-in browser fetched from Overpass, so the next traveler gets them at once.
 *   (Overpass doesn't answer requests from Cloudflare's network, so the browser does that fetch.)
 */

const UA = "XPMatch/1.0 (+https://xp-match.rork.app; travel planner)";
const TTL = 60 * 86_400_000;
const PLACES_TTL = 21 * 86_400_000;
const MAX_PLACES = 1100;
const KINDS = new Set(["eat", "do", "stay", "nightlife", "move"]);
const DIALS = ["refined", "buzz", "local", "splurge", "modern"] as const;

interface StoredPlaces {
  at: number;
  places: Record<string, unknown>[];
}

interface CityGeo {
  name: string;
  country: string;
  countryCode: string;
  center: [number, number];
  radius: number;
  wikidata?: string;
  cover?: string;
  blurb?: string;
  at: number;
  v?: number;
}

const GEO_VERSION = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Cache key for a city name: lowercase ASCII words joined by dashes. */
export const citySlug = (q: string): string =>
  q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "city";

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  boundingbox?: string[];
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
}

async function geocode(q: string): Promise<CityGeo | null> {
  const search = (type: string) =>
    getJson<NominatimHit[]>(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&extratags=1&namedetails=1&accept-language=en&featureType=${type}&q=${encodeURIComponent(q)}`,
    );
  // "city" means a town-level place (so "Oaxaca" is the city, not the state); fall back to any settlement.
  let hits = await search("city");
  if (!hits.length) hits = await search("settlement");
  const hit = hits[0];
  if (!hit) return null;
  const bb = (hit.boundingbox ?? []).map(Number);
  const diag = bb.length === 4 ? km({ lat: bb[0], lng: bb[2] }, { lat: bb[1], lng: bb[3] }) : 10;
  const geo: CityGeo = {
    name: hit.namedetails?.["name:en"] ?? hit.name ?? q,
    country: hit.address?.country ?? "",
    countryCode: (hit.address?.country_code ?? "").toLowerCase(),
    center: [Number(hit.lat), Number(hit.lon)],
    radius: Math.round(clamp((diag * 1000) / 4, 1500, 3500)),
    wikidata: hit.extratags?.wikidata,
    at: Date.now(),
    v: GEO_VERSION,
  };
  if (!geo.wikidata) return geo;
  try {
    const [thumbs, links] = await Promise.all([
      getJson<{ query?: { pages?: Record<string, { thumbnail?: { source: string } }> } }>(
        `https://www.wikidata.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=1280&format=json&titles=${geo.wikidata}`,
      ),
      getJson<{ entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> }>(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=${geo.wikidata}`,
      ),
    ]);
    geo.cover = Object.values(thumbs.query?.pages ?? {})[0]?.thumbnail?.source;
    const title = links.entities?.[geo.wikidata]?.sitelinks?.enwiki?.title;
    if (title) {
      const sum = await getJson<{ extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      const sentences = (sum.extract ?? "").split(/(?<=[.!?])\s+(?=[A-Z\u00C0-\u00DE])/);
      geo.blurb = sentences.slice(0, 2).join(" ").trim().slice(0, 320) || undefined;
    }
  } catch (e) {
    console.warn("[places] city extras failed", geo.name, e instanceof Error ? e.message : e);
  }
  return geo;
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Keeps only the known, size-capped fields of a place sent by a browser. */
function cleanPlace(v: unknown, center: { lat: number; lng: number }): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const id = str(p.id, 40);
  const name = str(p.name, 80);
  const kind = str(p.kind, 12);
  const lat = num(p.lat, -90, 90);
  const lng = num(p.lng, -180, 180);
  if (!/^osm-[nwr]\d{1,14}$/.test(id) || !name || !KINDS.has(kind) || lat === null || lng === null) return null;
  if (km(center, { lat, lng }) > 40) return null;
  const dialsIn = (p.dials ?? {}) as Record<string, unknown>;
  const dials = Object.fromEntries(DIALS.map((d) => [d, num(dialsIn[d], 0, 100) ?? 50]));
  const levels = Object.fromEntries(
    Object.entries((p.levels ?? {}) as Record<string, unknown>)
      .slice(0, 14)
      .map(([k, x]) => [k.slice(0, 24), num(x, 0, 1)])
      .filter((e): e is [string, number] => e[1] !== null && /^[a-z-]+$/.test(e[0])),
  );
  const aff = (p.affinity ?? {}) as Record<string, unknown>;
  const image = str(p.image, 400);
  const website = str(p.website, 200);
  return {
    id,
    name,
    kind,
    cuisine: str(p.cuisine, 40) || undefined,
    cat: str(p.cat, 24) || undefined,
    neighborhood: str(p.neighborhood, 60),
    city: str(p.city, 60),
    price: num(p.price, 1, 4) ?? 2,
    blurb: str(p.blurb, 260),
    tags: (Array.isArray(p.tags) ? p.tags : []).map((t) => str(t, 24)).filter((t) => /^[a-z-]+$/.test(t)).slice(0, 8),
    affinity: Object.fromEntries(["curator", "drifter", "trailblazer", "architect"].map((t) => [t, num(aff[t], 0, 100) ?? 50])),
    lat,
    lng,
    image: /^https:\/\/[a-z0-9.-]*(wikimedia|wikipedia)\.org\//.test(image) ? image : undefined,
    dials,
    levels,
    source: "osm",
    website: /^https?:\/\//.test(website) ? website : undefined,
    hours: str(p.hours, 90) || undefined,
    wikidata: /^Q\d{1,12}$/.test(str(p.wikidata, 14)) ? str(p.wikidata, 14) : undefined,
  };
}

/** One instance per city name: geocodes once, remembers the answer, and holds the shared place list. */
export class PlaceCache extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  private respond(geo: CityGeo): Response {
    const stored = kvGet<StoredPlaces>(this.sql, "places");
    const fresh = stored && Date.now() - stored.at < PLACES_TTL;
    const { at: _a, v: _v, ...city } = geo;
    return json({ city, places: fresh ? stored.places : null, placesAt: fresh ? stored.at : null });
  }

  override async fetch(request: Request): Promise<Response> {
    const q = str(new URL(request.url).searchParams.get("q"), 80);
    let geo = kvGet<CityGeo>(this.sql, "geo");

    if (request.method === "PUT") {
      if (!request.headers.get("X-Rork-User-Id")) return json({ error: "Sign in first." }, 401);
      if (!geo) return json({ error: "Unknown city" }, 404);
      const text = await request.text();
      if (text.length > 1_800_000) return json({ error: "Too large" }, 413);
      let body: { places?: unknown };
      try {
        body = JSON.parse(text) as { places?: unknown };
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const center = { lat: geo.center[0], lng: geo.center[1] };
      const places = (Array.isArray(body.places) ? body.places : [])
        .slice(0, MAX_PLACES)
        .map((p) => cleanPlace(p, center))
        .filter((p): p is Record<string, unknown> => p !== null);
      if (places.length < 10) return json({ error: "Not enough places" }, 400);
      const prev = kvGet<StoredPlaces>(this.sql, "places");
      // Never let a smaller, partial fetch replace a fuller fresh one.
      if (prev && Date.now() - prev.at < PLACES_TTL && prev.places.length > places.length * 1.15) return json({ ok: true, kept: prev.places.length });
      kvPut(this.sql, "places", { at: Date.now(), places } satisfies StoredPlaces);
      return json({ ok: true, stored: places.length });
    }

    if (geo && geo.v === GEO_VERSION && Date.now() - (geo.at ?? 0) < TTL) return this.respond(geo);
    try {
      const found = await geocode(q);
      if (!found) return json({ error: `We couldn't find a city called "${q}".` }, 404);
      kvPut(this.sql, "geo", found);
      geo = found;
      return this.respond(geo);
    } catch (e) {
      console.warn("[places] geocode failed", q, e instanceof Error ? e.message : e);
      if (geo) return this.respond(geo);
      return json({ error: "City search is busy. Try again in a moment." }, 503);
    }
  }
}
