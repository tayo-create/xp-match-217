import type { Place, PlaceKind, StyleDials } from "@/lib/types";

/**
 * Live places from OpenStreetMap (Overpass) for any city, turned into scored XP Match places.
 * Each place gets interest levels and style dials estimated from its OSM tags (cuisine, type,
 * stars, opening hours, whether it's famous enough for Wikidata), so the match engine can rank it
 * exactly like a hand-picked place. Famous places get a Wikidata photo and one-line description.
 */

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

type Tags = Record<string, string>;

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
}

interface Hood {
  name: string;
  lat: number;
  lng: number;
}

/** Where to look: the city's center, search radius in meters, and its country code. */
export interface OsmArea {
  name: string;
  center: [number, number];
  radius: number;
  countryCode: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]+$/u;

/** A readable name: the local one when it's in Latin script, otherwise English or romanized. */
const pickName = (t: Tags): string => {
  const name = (t.name ?? "").trim();
  if (LATIN.test(name)) return name;
  const latn = Object.keys(t).find((k) => /^name:[a-z]{2,3}[-_]Latn$/.test(k));
  return (t["name:en"] ?? t.int_name ?? (latn ? t[latn] : undefined) ?? name).trim();
};

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pretty = (v: string): string => cap(v.replace(/_/g, " "));

// ---------------------------------------------------------------- Queries

export type OsmStage = "food" | "sights" | "stays";

const queryFor = (stage: OsmStage, area: OsmArea): string => {
  const [lat, lng] = area.center;
  const a = (r: number) => `(around:${Math.round(r)},${lat},${lng})`;
  const R = area.radius;
  const R2 = Math.min(5000, R * 1.4);
  const head = "[out:json][timeout:40];";
  if (stage === "food") {
    return (
      head +
      `nwr["amenity"="restaurant"]["name"]${a(R)};out center tags 320;` +
      `nwr["amenity"~"^(cafe|ice_cream)$"]["name"]${a(R)};out center tags 90;` +
      `nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"]${a(R)};out center tags 30;` +
      `nwr["amenity"~"^(bar|pub|biergarten|nightclub)$"]["name"]${a(R)};out center tags 160;` +
      `nwr["amenity"~"^(marketplace|food_court)$"]["name"]${a(R)};out center tags 20;` +
      `node["place"~"^(suburb|neighbourhood|quarter)$"]["name"]${a(R2 * 1.5)};out body 300;`
    );
  }
  if (stage === "sights") {
    return (
      head +
      `nwr["tourism"~"^(museum|attraction|viewpoint|zoo|aquarium|theme_park)$"]["name"]${a(R2)};out center tags 200;` +
      `nwr["tourism"="gallery"]["name"]${a(R2)};out center tags 40;` +
      `nwr["historic"~"^(castle|palace|monument|memorial|fort|ruins|city_gate|manor|archaeological_site|tower)$"]["name"]["wikidata"]${a(R2)};out center tags 80;` +
      `nwr["building"~"^(cathedral|basilica)$"]["name"]${a(R2)};out center tags 20;` +
      `nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"]${a(R2)};out center tags 70;` +
      `nwr["natural"~"^(beach|peak)$"]["name"]${a(R2)};out center tags 20;` +
      `nwr["amenity"~"^(theatre|arts_centre|concert_hall|music_venue)$"]["name"]${a(R2)};out center tags 50;`
    );
  }
  return (
    head +
    `nwr["tourism"~"^(hotel|hostel|guest_house)$"]["name"]${a(R)};out center tags 120;` +
    `nwr["railway"="station"]["name"]["wikidata"]${a(R2)};out center tags 12;` +
    `nwr["amenity"~"^(bicycle_rental|ferry_terminal)$"]["name"]${a(R)};out center tags 15;`
  );
};

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

async function overpass(query: string, signal?: AbortSignal): Promise<OsmElement[]> {
  let lastErr: unknown;
  for (const [i, endpoint] of OVERPASS.entries()) {
    try {
      const timeout = AbortSignal.timeout(i === 0 ? 45_000 : 30_000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`,
        // AbortSignal.any is missing in older Safari; fall back to the timeout alone there.
        signal: signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const body = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      const elements = body.elements ?? [];
      if (!elements.length && body.remark) throw new Error("Overpass ran out of time");
      return elements;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      console.warn("[osm] overpass attempt failed", endpoint, e instanceof Error ? e.message : e);
      await sleep(600);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass unavailable");
}

// ---------------------------------------------------------------- Tags → scoring data

const LOCAL_CUISINE: Record<string, string> = {
  pt: "portuguese", es: "spanish", it: "italian", fr: "french", de: "german", at: "austrian", ch: "swiss", jp: "japanese", mx: "mexican", gr: "greek", tr: "turkish",
  th: "thai", vn: "vietnamese", kr: "korean", cn: "chinese", in: "indian", gb: "british", ie: "irish", us: "american", pe: "peruvian", ar: "argentinian", br: "brazilian",
  ma: "moroccan", lb: "lebanese", hu: "hungarian", cz: "czech", pl: "polish", nl: "dutch", be: "belgian", dk: "danish", se: "swedish", no: "norwegian", hr: "croatian",
  ge: "georgian", id: "indonesian", my: "malaysian", ph: "filipino", et: "ethiopian", co: "colombian", cu: "cuban", il: "israeli", eg: "egyptian", ru: "russian", ua: "ukrainian",
};

const CUISINE_LEVELS: [RegExp, [string, number][]][] = [
  [/^(steak_house|steak|steakhouse)$/, [["steak", 0.92], ["meat", 0.85]]],
  [/^(grill|barbecue|bbq|churrasco|churrascaria|argentinian|brazilian|asado|yakiniku|rodizio)$/, [["meat", 0.82], ["steak", 0.55]]],
  [/^(burger)$/, [["street-food", 0.6], ["meat", 0.6]]],
  [/^(seafood|fish|fish_and_chips|oyster|oysters|marisqueira)$/, [["seafood", 0.92]]],
  [/^(sushi)$/, [["seafood", 0.7]]],
  [/^(japanese)$/, [["seafood", 0.35]]],
  [/^(ramen|noodle|noodles|udon|soba|pho)$/, [["ramen", 0.85], ["street-food", 0.4]]],
  [/^(portuguese)$/, [["portuguese", 0.88]]],
  [/^(tapas|meze|mezze|izakaya|small_plates|pintxos|petiscos)$/, [["small-plates", 0.88], ["social", 0.55]]],
  [/^(pizza|kebab|sandwich|street_food|hot_dog|taco|tacos|falafel|crepe|dumpling|dumplings|empanada|arepa|bao|bagel|doner|shawarma|gyros|chicken|fries)$/, [["street-food", 0.75]]],
  [/^(breakfast|brunch)$/, [["breakfast", 0.85], ["slow", 0.5]]],
  [/^(coffee_shop|coffee)$/, [["breakfast", 0.65], ["slow", 0.6]]],
  [/^(cake|pastry|dessert|donut|waffle|pancake|patisserie)$/, [["pastry", 0.85]]],
  [/^(ice_cream|gelato|frozen_yogurt)$/, [["pastry", 0.55]]],
  [/^(wine|wine_bar)$/, [["wine", 0.85]]],
  [/^(fine_dining|gourmet)$/, [["chef-driven", 0.88], ["intimate", 0.6]]],
  [/^(regional|local|traditional|home_cooking)$/, [["local-favorite", 0.7]]],
  [/^(fusion|modern|international)$/, [["chef-driven", 0.45], ["design", 0.35]]],
];

const STREETISH = /^(pizza|kebab|sandwich|street_food|hot_dog|taco|tacos|falafel|crepe|dumpling|dumplings|empanada|arepa|bao|bagel|doner|shawarma|gyros|chicken|fries|burger)$/;

/** Starting point per type: [refined, buzz, local, modern]; splurge comes from price. */
const BASE_DIALS: Record<string, [number, number, number, number]> = {
  restaurant: [50, 50, 60, 50], cafe: [35, 40, 60, 65], bakery: [25, 45, 60, 30], ice_cream: [25, 60, 45, 55], market: [20, 92, 40, 30], food_hall: [30, 92, 25, 70],
  bar: [50, 70, 60, 55], pub: [25, 75, 60, 20], biergarten: [15, 90, 55, 20], nightclub: [45, 95, 45, 75],
  museum: [75, 30, 35, 55], gallery: [70, 20, 65, 80], arts_centre: [55, 45, 55, 75], theatre: [75, 55, 40, 35], concert_hall: [75, 60, 35, 50], music_venue: [35, 85, 60, 55],
  viewpoint: [20, 45, 50, 30], attraction: [50, 70, 20, 50], zoo: [40, 80, 15, 55], aquarium: [45, 75, 15, 65], theme_park: [30, 92, 10, 70],
  castle: [75, 55, 20, 10], palace: [80, 55, 20, 10], monument: [50, 40, 40, 20], memorial: [50, 25, 45, 25], ruins: [40, 25, 55, 10], church: [70, 35, 35, 10], historic: [55, 35, 45, 15],
  park: [30, 40, 50, 35], garden: [55, 15, 55, 35], nature_reserve: [20, 15, 65, 30], beach: [15, 55, 45, 40], peak: [15, 10, 70, 30],
  hotel: [65, 40, 40, 60], hostel: [20, 85, 45, 65], guest_house: [40, 20, 75, 35], station: [45, 80, 15, 45], bicycle_rental: [25, 40, 50, 70], ferry_terminal: [20, 55, 40, 40],
};

const PRICE_TO_SPLURGE = [10, 15, 45, 75, 95];

const TYPE_LABEL: Record<string, string> = {
  cafe: "Café", bakery: "Bakery", ice_cream: "Gelato", market: "Market", food_hall: "Food hall", bar: "Bar", pub: "Pub", biergarten: "Beer garden", nightclub: "Club",
  museum: "Museum", gallery: "Gallery", arts_centre: "Arts center", theatre: "Theater", concert_hall: "Concert hall", music_venue: "Live music", viewpoint: "Viewpoint",
  attraction: "Landmark", zoo: "Zoo", aquarium: "Aquarium", theme_park: "Theme park", castle: "Castle", palace: "Palace", monument: "Monument", memorial: "Memorial",
  ruins: "Ruins", church: "Cathedral", historic: "Historic site", park: "Park", garden: "Garden", nature_reserve: "Nature reserve", beach: "Beach", peak: "Peak",
  hotel: "Hotel", hostel: "Hostel", guest_house: "Guesthouse", station: "Train station", bicycle_rental: "Bike rental", ferry_terminal: "Ferry",
};

/** Which neutral photo a place without its own photo gets. */
const PHOTO_CAT: Record<string, string> = {
  restaurant: "restaurant", cafe: "cafe", bakery: "cafe", ice_cream: "cafe", market: "market", food_hall: "market", bar: "bar", pub: "bar", biergarten: "bar", nightclub: "bar",
  music_venue: "bar", museum: "museum", gallery: "museum", arts_centre: "museum", theatre: "museum", concert_hall: "museum", park: "park", garden: "park", nature_reserve: "park",
  beach: "park", peak: "park", viewpoint: "park", zoo: "park", castle: "landmark", palace: "landmark", monument: "landmark", memorial: "landmark", ruins: "landmark",
  church: "landmark", historic: "landmark", attraction: "landmark", aquarium: "landmark", theme_park: "landmark", hotel: "hotel", hostel: "hotel", guest_house: "hotel",
  station: "station", bicycle_rental: "station", ferry_terminal: "station",
};

const classify = (t: Tags): { kind: PlaceKind; type: string } | null => {
  const am = t.amenity;
  const tr = t.tourism;
  const hi = t.historic;
  if (am === "restaurant") return { kind: "eat", type: "restaurant" };
  if (am === "cafe" || am === "ice_cream") return { kind: "eat", type: am };
  if (t.shop === "bakery" || t.shop === "pastry" || t.shop === "confectionery") return { kind: "eat", type: "bakery" };
  if (am === "marketplace") return { kind: "eat", type: "market" };
  if (am === "food_court") return { kind: "eat", type: "food_hall" };
  if (am === "bar" || am === "pub" || am === "biergarten" || am === "nightclub") return { kind: "nightlife", type: am };
  if (tr === "hotel" || tr === "hostel" || tr === "guest_house") return { kind: "stay", type: tr };
  if (t.railway === "station") return { kind: "move", type: "station" };
  if (am === "bicycle_rental" || am === "ferry_terminal") return { kind: "move", type: am };
  if (tr === "museum" || tr === "gallery") return { kind: "do", type: tr };
  if (hi === "castle" || hi === "fort") return { kind: "do", type: "castle" };
  if (hi === "palace" || hi === "manor") return { kind: "do", type: "palace" };
  if (hi === "ruins" || hi === "archaeological_site") return { kind: "do", type: "ruins" };
  if (hi === "monument" || hi === "memorial") return { kind: "do", type: hi };
  if (t.building === "cathedral" || t.building === "basilica") return { kind: "do", type: "church" };
  if (am === "theatre" || am === "arts_centre" || am === "concert_hall") return { kind: "do", type: am };
  if (am === "music_venue") return { kind: "nightlife", type: am };
  if (tr === "viewpoint" || tr === "zoo" || tr === "aquarium" || tr === "theme_park") return { kind: "do", type: tr };
  if (t.leisure === "park" || t.leisure === "garden" || t.leisure === "nature_reserve") return { kind: "do", type: t.leisure };
  if (t.natural === "beach" || t.natural === "peak") return { kind: "do", type: t.natural };
  if (hi) return { kind: "do", type: "historic" };
  if (tr === "attraction") return { kind: "do", type: "attraction" };
  return null;
};

const isLate = (hours: string | undefined): boolean => Boolean(hours && /-(0[0-5]|24|2[4-9]):\d\d/.test(hours));

const imageFromTags = (t: Tags): string | undefined => {
  const commons = (t.wikimedia_commons ?? ((t.image ?? "").startsWith("File:") ? t.image : "") ?? "").trim();
  if (commons.startsWith("File:")) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.slice(5))}?width=800`;
  return undefined;
};

/** Per-type interest levels, before cuisine and name hints. */
const TYPE_LEVELS: Record<string, [string, number][]> = {
  cafe: [["breakfast", 0.7], ["slow", 0.65], ["cozy", 0.55]],
  ice_cream: [["pastry", 0.6]],
  bakery: [["pastry", 0.92], ["breakfast", 0.75]],
  market: [["market", 0.92], ["street-food", 0.6], ["social", 0.6]],
  food_hall: [["food-hall", 0.92], ["social", 0.8], ["street-food", 0.6]],
  bar: [["social", 0.6], ["nightlife", 0.6]],
  pub: [["social", 0.8], ["nightlife", 0.5], ["local-favorite", 0.5]],
  biergarten: [["social", 0.9], ["slow", 0.4]],
  nightclub: [["nightlife", 0.95], ["social", 0.85]],
  museum: [["museum", 0.92]],
  gallery: [["art", 0.9], ["design", 0.55]],
  arts_centre: [["art", 0.7], ["design", 0.65]],
  theatre: [["live-music", 0.7], ["iconic", 0.35]],
  concert_hall: [["live-music", 0.7], ["iconic", 0.35]],
  music_venue: [["live-music", 0.9], ["nightlife", 0.7]],
  viewpoint: [["viewpoint", 0.95], ["photography", 0.8], ["sunset", 0.7]],
  attraction: [["iconic", 0.6], ["photography", 0.5]],
  zoo: [["iconic", 0.5], ["social", 0.5], ["active", 0.4]],
  aquarium: [["iconic", 0.5], ["social", 0.5]],
  theme_park: [["social", 0.6], ["active", 0.5], ["adventure", 0.5]],
  castle: [["history", 0.9], ["palace", 0.7], ["iconic", 0.5]],
  palace: [["palace", 0.92], ["history", 0.85]],
  monument: [["history", 0.75], ["photography", 0.4]],
  memorial: [["history", 0.75]],
  ruins: [["history", 0.9], ["adventure", 0.4]],
  church: [["history", 0.75], ["iconic", 0.5], ["design", 0.4]],
  historic: [["history", 0.7]],
  park: [["garden", 0.65], ["slow", 0.7], ["city-walks", 0.5], ["quiet", 0.45]],
  garden: [["garden", 0.95], ["slow", 0.8], ["quiet", 0.7]],
  nature_reserve: [["adventure", 0.65], ["active", 0.7], ["garden", 0.4]],
  beach: [["slow", 0.65], ["sunset", 0.75], ["active", 0.45]],
  peak: [["adventure", 0.8], ["active", 0.8], ["viewpoint", 0.7], ["hidden-viewpoint", 0.5]],
  hostel: [["social", 0.9], ["nightlife", 0.4]],
  guest_house: [["cozy", 0.75], ["quiet", 0.6], ["local-favorite", 0.55]],
  bicycle_rental: [["active", 0.85], ["scenic-route", 0.75], ["adventure", 0.5]],
  ferry_terminal: [["scenic-route", 0.9], ["sunset", 0.5], ["day-trip", 0.5]],
};

const FREE = new Set(["park", "garden", "nature_reserve", "beach", "peak", "viewpoint", "monument", "memorial", "church", "historic", "station", "bicycle_rental", "ferry_terminal"]);
const CHEAP = new Set(["cafe", "bakery", "ice_cream", "market", "food_hall", "pub", "biergarten", "hostel"]);

function toPlace(el: OsmElement, area: OsmArea, hoods: Hood[]): Place | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const c = classify(t);
  if (!c) return null;
  const name = pickName(t);
  if (!name || name.length > 70) return null;
  if (t.disused === "yes" || t.abandoned === "yes") return null;
  const brand = Boolean(t.brand || t["brand:wikidata"]);
  // Chains aren't what anyone travels for.
  if (brand && (c.kind === "eat" || c.kind === "nightlife") && c.type !== "market") return null;

  const { kind, type } = c;
  const famous = Boolean(t.wikidata);
  const website = [t.website, t["contact:website"]].find((w) => w && /^https?:\/\//.test(w))?.slice(0, 200);
  const hours = t.opening_hours?.slice(0, 90);
  const late = isLate(hours);
  const nm = name.toLowerCase();
  const cuisines = (t.cuisine ?? "")
    .toLowerCase()
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const local = LOCAL_CUISINE[area.countryCode];
  const stars = Number.parseInt(t.stars ?? "", 10);

  const L: Record<string, number> = {};
  const add = (tag: string, v: number) => {
    L[tag] = Math.max(L[tag] ?? 0, v);
  };
  for (const cu of cuisines) {
    for (const [re, levels] of CUISINE_LEVELS) if (re.test(cu)) levels.forEach(([tag, v]) => add(tag, v));
    if (local && cu === local) add("local-favorite", 0.7);
  }
  (TYPE_LEVELS[type] ?? []).forEach(([tag, v]) => add(tag, v));
  if (type === "restaurant" && !cuisines.length) add("local-favorite", 0.4);
  if (type === "bar") {
    if (/wine|vin|vino|vinho|wein|enoteca|bodega/.test(nm) || t.bar === "wine" || cuisines.includes("wine")) {
      add("wine", 0.9);
      add("intimate", 0.5);
      if (/natur/.test(nm)) add("natural-wine", 0.85);
    }
    if (/cocktail|speakeasy|mixolog/.test(nm) || t["drink:cocktail"] === "yes") add("cocktails", 0.88);
  }
  if (type === "museum") {
    if (t.museum === "art" || /\b(art|kunst|arte|galer|modern)/i.test(name)) {
      add("art", 0.85);
      add("design", 0.5);
    }
    if (t.museum === "history" || /histor/i.test(name)) add("history", 0.8);
  }
  if (type === "viewpoint" && !famous) {
    add("hidden-viewpoint", 0.75);
    add("hidden-gem", 0.5);
  }
  if (type === "hotel") {
    if (stars >= 4 && !brand) {
      add("boutique", 0.8);
      add("design", 0.55);
      add("quiet", 0.5);
    } else add("quiet", 0.4);
    if (stars >= 5) add("iconic", 0.45);
  }
  if (type === "station" && famous) add("history", 0.4);
  if (t.live_music === "yes") add("live-music", 0.85);
  if (/rooftop|roof ?top|sky ?bar|terraza|terrasse/.test(nm) || t.rooftop === "yes") {
    add("rooftop", 0.85);
    add("sunset", 0.6);
  }
  if (late && kind !== "nightlife") add("nightlife", 0.35);
  if (kind === "eat" || kind === "nightlife") {
    if (famous) add("iconic", 0.6);
    else {
      add("local-favorite", 0.55);
      if (!website) add("hidden-gem", 0.5);
    }
  } else if (kind === "do") {
    if (famous) add("iconic", 0.7);
    else add("hidden-gem", 0.55);
  }

  const streetish = cuisines.some((cu) => STREETISH.test(cu));
  const fine = cuisines.some((cu) => /fine_dining|gourmet/.test(cu));
  let price = 2;
  if (type === "restaurant") price = fine ? 4 : streetish ? 1 : famous ? 3 : 2;
  else if (CHEAP.has(type) || FREE.has(type)) price = 1;
  else if (type === "bar") price = L.rooftop ? 3 : 2;
  else if (type === "hotel") price = Number.isFinite(stars) ? clamp(stars - 1, 1, 4) : 2;

  let [refined, buzz, loc, modern] = BASE_DIALS[type] ?? [50, 50, 50, 50];
  if (streetish) {
    refined -= 25;
    buzz += 10;
  }
  if (fine || (L["chef-driven"] ?? 0) > 0.6) refined += 30;
  if ((L["local-favorite"] ?? 0) >= 0.7) {
    loc += 10;
    modern -= 20;
  }
  if (cuisines.some((cu) => /fusion|vegan|poke|modern/.test(cu))) modern += 20;
  if (famous) {
    loc -= 35;
    refined += 5;
  }
  if (brand) loc -= 40;
  if (!website && kind !== "do") loc += 8;
  if (t.outdoor_seating === "yes") buzz += 5;
  if (late) buzz += 10;
  if (type === "hotel" && Number.isFinite(stars)) refined = 30 + stars * 13;
  const id = `osm-${el.type[0]}${el.id}`;
  const h = hash(id);
  // A small, stable nudge per place so near-identical places don't tie.
  const jitter = (n: number) => (((h >>> (n * 5)) & 31) / 31) * 14 - 7;
  const dials: StyleDials = {
    refined: Math.round(clamp(refined + jitter(0), 2, 98)),
    buzz: Math.round(clamp(buzz + jitter(1), 2, 98)),
    local: Math.round(clamp(loc + jitter(2), 2, 98)),
    splurge: Math.round(clamp(PRICE_TO_SPLURGE[price] + jitter(3), 2, 98)),
    modern: Math.round(clamp(modern + jitter(4), 2, 98)),
  };
  const levels = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  const tags = Object.entries(levels)
    .filter(([, v]) => v >= 0.45)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  const hood =
    t["addr:suburb"] ??
    t["addr:neighbourhood"] ??
    t["addr:quarter"] ??
    t["addr:district"] ??
    hoods.reduce<{ name: string; d: number }>(
      (best, x) => {
        const d = km({ lat, lng }, x);
        return d < best.d ? { name: x.name, d } : best;
      },
      { name: "", d: 2.5 },
    ).name;

  let label = TYPE_LABEL[type] ?? "Place";
  if (type === "restaurant") {
    const main = cuisines.find((cu) => !/^(regional|local|traditional|international|home_cooking)$/.test(cu)) ?? cuisines[0];
    label = main ? (/^(regional|local|traditional|home_cooking)$/.test(main) ? (local ? pretty(local) : "Regional") : pretty(main)) : "Restaurant";
  } else if (type === "bar") label = (L.wine ?? 0) >= 0.85 ? "Wine bar" : (L.cocktails ?? 0) >= 0.85 ? "Cocktail bar" : L.rooftop ? "Rooftop bar" : "Bar";
  else if (type === "museum" && (L.art ?? 0) >= 0.85) label = "Art museum";
  else if (type === "hotel" && Number.isFinite(stars)) label = `${stars}-star hotel`;
  else if (type === "cafe" && cuisines.some((cu) => /coffee/.test(cu))) label = "Coffee";

  const noun = type === "restaurant" && label !== "Restaurant" ? `${label} restaurant` : label;
  const extras = [
    t.outdoor_seating === "yes" ? "terrace seating" : "",
    late ? "open late" : "",
    t["diet:vegan"] === "yes" || t["diet:vegan"] === "only" ? "vegan options" : "",
    t.live_music === "yes" ? "live music" : "",
  ].filter(Boolean);

  return {
    id,
    name,
    kind,
    cuisine: label,
    neighborhood: hood,
    city: area.name,
    price,
    blurb: `${noun}${hood ? ` in ${hood}` : ""}.${extras.length ? ` ${cap(extras.join(" · "))}.` : ""}`,
    tags,
    affinity: {
      curator: Math.round((dials.refined + dials.local) / 2),
      drifter: Math.round((200 - dials.buzz - dials.splurge) / 2),
      trailblazer: Math.round((dials.buzz + dials.local) / 2),
      architect: Math.round((dials.refined + dials.splurge) / 2),
    },
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    image: imageFromTags(t),
    source: "osm",
    levels,
    dials,
    cat: PHOTO_CAT[type],
    website,
    hours,
    wikidata: t.wikidata,
  };
}

/** Adds Wikidata photos and one-line descriptions to famous places (sights first). */
async function enrich(places: Place[], signal?: AbortSignal): Promise<void> {
  const famous = places.filter((p) => p.wikidata && /^Q\d+$/.test(p.wikidata)).sort((a, b) => Number(b.kind === "do") - Number(a.kind === "do"));
  const ids = [...new Set(famous.map((p) => p.wikidata as string))].slice(0, 150);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join("|");
    try {
      const [thumbs, ents] = await Promise.all([
        fetch(`https://www.wikidata.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*&titles=${batch}`, { signal }).then(
          (r) => r.json() as Promise<{ query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> } }>,
        ),
        fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=descriptions&languages=en&format=json&origin=*&ids=${batch}`, { signal }).then(
          (r) => r.json() as Promise<{ entities?: Record<string, { descriptions?: { en?: { value: string } } }> }>,
        ),
      ]);
      const img = new Map(Object.values(thumbs.query?.pages ?? {}).map((p) => [p.title, p.thumbnail?.source]));
      for (const p of famous) {
        if (!p.wikidata) continue;
        const src = img.get(p.wikidata);
        if (src && !p.image) p.image = src;
        const desc = ents.entities?.[p.wikidata]?.descriptions?.en?.value;
        if (desc && desc.length < 140 && !/^wikimedia/i.test(desc)) {
          const where = / in /i.test(desc) || !p.neighborhood ? "" : ` in ${p.neighborhood}`;
          const tail = p.blurb.includes(". ") ? p.blurb.slice(p.blurb.indexOf(". ") + 1) : "";
          p.blurb = `${cap(desc)}${where}.${tail}`;
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      console.warn("[osm] wikidata enrich failed", e instanceof Error ? e.message : e);
    }
  }
}

const CAPS: Record<string, number> = { restaurant: 260, cafe: 70, bar: 110, pub: 45, hotel: 70 };
const capBucket = (p: Place): string => (p.kind === "eat" && p.cat === "restaurant" ? "restaurant" : p.cat === "cafe" ? "cafe" : p.cuisine === "Pub" ? "pub" : p.cat === "bar" ? "bar" : p.cat === "hotel" ? "hotel" : "");

/** Drops duplicates (one place mapped as both a point and a building) and caps very common types. */
const tidy = (list: Place[]): Place[] => {
  const seen = new Map<string, Place>();
  const counts: Record<string, number> = {};
  const out: Place[] = [];
  for (const p of list) {
    const key = p.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const dup = seen.get(key);
    if (dup && km(dup, p) < 0.25) continue;
    seen.set(key, p);
    const bucket = capBucket(p);
    if (bucket) {
      counts[bucket] = (counts[bucket] ?? 0) + 1;
      if (counts[bucket] > (CAPS[bucket] ?? 999)) continue;
    }
    out.push(p);
  }
  return out;
};

/**
 * Fetches live places for an area in three stages (food & drink, sights, stays & transit).
 * Stages that fail are skipped; throws only when nothing at all came back.
 */
export async function fetchOsmPlaces(area: OsmArea, signal?: AbortSignal): Promise<Place[]> {
  const run = (stage: OsmStage) =>
    overpass(queryFor(stage, area), signal).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      console.warn("[osm] stage failed", stage, e instanceof Error ? e.message : e);
      return [] as OsmElement[];
    });
  // Overpass allows a couple of parallel requests per visitor; the third waits its turn.
  const [food, sights] = await Promise.all([run("food"), run("sights")]);
  const stays = await run("stays");
  const all = [...food, ...sights, ...stays];
  const hoods: Hood[] = food
    .filter((e) => e.tags?.place && e.lat !== undefined && e.lon !== undefined)
    .map((e) => ({ name: pickName(e.tags ?? {}), lat: e.lat as number, lng: e.lon as number }))
    .filter((h) => h.name);
  const places = tidy(all.map((e) => toPlace(e, area, hoods)).filter((p): p is Place => p !== null));
  if (!places.length) throw new Error("Couldn't load places for this city right now.");
  await enrich(places, signal);
  return places;
}
