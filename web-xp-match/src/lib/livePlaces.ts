import { queryOptions } from "@tanstack/react-query";

import { CITIES, PLACES } from "@/data/places";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { IMG } from "@/lib/images";
import { fetchOsmPlaces } from "@/lib/osm";
import type { Place } from "@/lib/types";
import { fetchWithAuth } from "@/providers/AuthProvider";

/** A city as the places service knows it. */
export interface CityInfo {
  name: string;
  country: string;
  countryCode: string;
  center: [number, number];
  radius: number;
  cover: string;
  blurb?: string;
}

/** Every place we can recommend in a city: hand-picked ones first, then live OpenStreetMap places. */
export interface CityPlaces {
  city: CityInfo;
  places: Place[];
  liveCount: number;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** City names match regardless of case and accents ("bogota" = "Bogotá"). */
export const sameCity = (a: string, b: string): boolean => norm(a) === norm(b);

export const curatedFor = (city: string | undefined): Place[] => (city ? PLACES.filter((p) => sameCity(p.city, city)) : []);

export const cityPlacesKey = (city: string) => ["city-places", norm(city)] as const;

const km = (a: Place, b: Place): number => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** Hands a freshly fetched city to the backend so the next traveler gets it instantly. */
async function share(city: string, places: Place[]): Promise<void> {
  try {
    await fetchWithAuth(`${BACKEND_PATH}/places/city?q=${encodeURIComponent(city)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ places }),
    });
  } catch {
    // Sharing is best effort; this traveler already has the places.
  }
}

/**
 * Loads everything recommendable in a city. Uses the shared backend cache when another traveler
 * already loaded the city; otherwise fetches live places from OpenStreetMap and shares them.
 * Hand-picked cities still work offline from the catalog if live data is unavailable.
 */
export async function loadCityPlaces(city: string): Promise<CityPlaces> {
  const curated = curatedFor(city);
  const known = CITIES.find((c) => sameCity(c.name, city));
  const display = known?.name ?? city.trim();

  let info: (Omit<CityInfo, "cover"> & { cover?: string }) | undefined;
  let cached: Place[] | null = null;
  try {
    const body = await readJson<{ city: Omit<CityInfo, "cover"> & { cover?: string }; places: Place[] | null }>(await fetch(`${BACKEND_PATH}/places/city?q=${encodeURIComponent(display)}`));
    info = body.city;
    cached = body.places;
  } catch (e) {
    console.warn("[places] city lookup failed", display, e instanceof Error ? e.message : e);
    if (!known) throw e instanceof Error ? e : new Error(`We couldn't find ${display}.`);
  }

  let live: Place[] = cached ?? [];
  if (!cached && info) {
    try {
      live = await fetchOsmPlaces({ name: display, center: info.center, radius: info.radius || 2500, countryCode: info.countryCode });
      void share(display, live);
    } catch (e) {
      console.warn("[places] live places failed", display, e instanceof Error ? e.message : e);
      if (!curated.length) throw new Error(`Couldn't load places in ${display} right now. Try again in a minute.`);
    }
  }

  // Live copies of hand-picked places are dropped so each place appears once.
  const kept = live
    .map((p) => ({ ...p, city: display }))
    .filter((p) => !curated.some((c) => norm(c.name) === norm(p.name) && km(c, p) < 0.5));

  const city_: CityInfo = known
    ? { name: known.name, country: known.country, countryCode: info?.countryCode ?? "", center: known.center, radius: info?.radius ?? 2500, cover: known.cover, blurb: known.blurb }
    : {
        name: display,
        country: info?.country ?? "",
        countryCode: info?.countryCode ?? "",
        center: info?.center ?? CITIES[0].center,
        radius: info?.radius ?? 2500,
        cover: info?.cover ?? IMG.genCity,
        blurb: info?.blurb,
      };
  return { city: city_, places: [...curated, ...kept], liveCount: kept.length };
}

/** Shared query for a city's places; one fetch per city per session, deduped across screens. */
export const cityPlacesQuery = (city: string) =>
  queryOptions({
    queryKey: cityPlacesKey(city),
    queryFn: () => loadCityPlaces(city),
    staleTime: 6 * 3_600_000,
    gcTime: 24 * 3_600_000,
    retry: 1,
  });

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];
const PREP = new Set(["in", "to", "visit", "visiting", "around", "explore", "exploring", "near", "through"]);
const CONNECT = new Set(["de", "del", "da", "do", "di", "la", "le", "el", "of", "am", "an", "upon", "sur", "en", "y"]);
const STOP = new Set([
  ...MONTHS,
  "the", "a", "an", "my", "our", "your", "their", "this", "that", "these", "those", "next", "late", "early", "mid", "summer", "winter", "spring", "fall", "autumn",
  "town", "city", "style", "search", "need", "love", "mind", "total", "peace", "general", "advance", "person", "time", "day", "days", "week", "weeks", "weekend",
  "night", "nights", "it", "me", "us", "them", "him", "her", "there", "here", "two", "three", "four", "five", "six", "food", "something", "somewhere", "anywhere",
  "mood", "budget", "case", "fact", "order", "place", "places", "touch", "front", "charge", "between", "bed", "go", "get", "see", "eat", "try", "do", "be", "have",
  "spend", "relax", "chill", "plan", "find", "book", "stay", "and", "or", "with", "for", "some", "any", "more", "less", "one", "detail", "particular", "public",
  "style", "bars", "bar", "restaurants", "museums", "town", "downtown", "nature", "parks", "markets", "general", "short", "long", "new",
]);

const titleCase = (s: string): string =>
  s
    .split(" ")
    .map((w, i) => (i > 0 && CONNECT.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

/**
 * Likely destination names in free text, e.g. "4 days in Mexico City" -> ["Mexico City"].
 * Capitalized names come first; the concierge checks each one against the map.
 */
export function guessCities(text: string): string[] {
  const words = text.replace(/[,.!?;:()"“”]/g, " ").split(/\s+/).filter(Boolean);
  const found: { name: string; cap: boolean }[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (!PREP.has(words[i].toLowerCase())) continue;
    let j = i + 1;
    const first = words[j];
    if (STOP.has(first.toLowerCase()) || /\d/.test(first) || first.length < 3) continue;
    const isCap = /^\p{Lu}/u.test(first);
    const parts = [first];
    if (isCap) {
      while (parts.length < 4 && words[j + 1]) {
        const w = words[j + 1];
        // "City"/"Town" can end a name ("Mexico City"); months and other filler can't.
        if (/^\p{Lu}/u.test(w) && (!STOP.has(w.toLowerCase()) || /^(city|town)$/i.test(w))) {
          parts.push(w);
          j += 1;
        } else if (CONNECT.has(w.toLowerCase()) && words[j + 2] && /^\p{Lu}/u.test(words[j + 2])) {
          parts.push(w, words[j + 2]);
          j += 2;
        } else break;
      }
    }
    const name = titleCase(parts.join(" "));
    if (!found.some((f) => f.name === name)) found.push({ name, cap: isCap });
  }
  return found
    .sort((a, b) => Number(b.cap) - Number(a.cap))
    .map((f) => f.name)
    .slice(0, 3);
}
