import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_SETTINGS, INTEREST_BY_ID, PACES, applyTripSettings, paceCap } from "@/data/interests";
import { CITIES, KIND_LABEL } from "@/data/places";
import { TRAVELER_TYPES, tagLabel } from "@/data/travelerTypes";
import { chatJson } from "@/lib/ai";
import { randomId } from "@/lib/backend";
import { type CityPlaces, cityPlacesQuery, curatedFor, guessCities, sameCity } from "@/lib/livePlaces";
import { blendLabel, groupScore, scorePlace, sortedTypes } from "@/lib/match";
import { uid, usePersistentState } from "@/lib/persist";
import type { ChatPickMessage, ConciergeChat, Place, PlaceKind, PlannedUpdate, TasteProfile, Trip, TripSettings } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { XP_AUTHOR, useTrips } from "@/providers/TripsProvider";

/** Another person on a shared trip whose taste should count. */
export interface GroupMate {
  name: string;
  profile: TasteProfile;
}

/** The shared state of a live trip room, as stored by the backend. */
export interface RoomDoc {
  trip: Trip | null;
  messages: ChatPickMessage[];
  settings: TripSettings | null;
  title: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
}

/** Union of two message lists by id, oldest first. */
export const mergeMessages = (a: ChatPickMessage[], b: ChatPickMessage[]): ChatPickMessage[] => {
  const map = new Map<string, ChatPickMessage>();
  a.forEach((m) => map.set(m.id, m));
  b.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt);
};

interface AiReply {
  reply: string;
  pickIds?: string[];
  plan?: { id: string; day: number; time?: string }[];
  suggestions?: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Finds a catalog city in free text; returns undefined when none is mentioned. */
export const findCity = (text: string): string | undefined =>
  CITIES.find((c) => text.toLowerCase().includes(c.name.toLowerCase()))?.name;

const detectKinds = (text: string): PlaceKind[] => {
  const t = text.toLowerCase();
  const kinds: PlaceKind[] = [];
  if (/\b(eat|food|steak|dinner|lunch|breakfast|restaurant|ramen|coffee|brunch|seafood|hungry|sushi|pizza|tapas|bakery|pastr|caf[eé])/.test(t)) kinds.push("eat");
  if (/\b(bars?|drinks?|cocktail|wine|nightlife|night out|rooftop|music|fado|club|pub)/.test(t)) kinds.push("nightlife");
  if (/\b(stay|hotels?|sleep|hostel|accommodation)/.test(t)) kinds.push("stay");
  if (/\b(things to do|see|sights?|museums?|views?|viewpoint|activit|walk|day trip|hike|surf|gardens?|parks?|galler|histor|castle|palace|beach)/.test(t)) kinds.push("do");
  if (/\b(get around|transport|tram|train|bikes?|transit|ferry)/.test(t)) kinds.push("move");
  return kinds;
};

const WORD_STOP = new Set(["days", "week", "weekend", "trip", "want", "great", "nothing", "touristy", "plan", "with", "some", "more", "like", "place", "places", "spot", "spots", "good", "best", "really", "find", "show", "near", "from", "that", "this", "there", "lover", "hates", "crowds", "long", "slow", "cozy"]);

/** Specific things asked for ("steak", "sushi", "jazz") matched against place tags and cuisine. */
const keywordsOf = (text: string): string[] =>
  [...new Set(text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !WORD_STOP.has(w)).map((w) => w.replace(/(es|s)$/, "")))].slice(0, 8);

const mentions = (p: Place, words: string[]): boolean => {
  if (!words.length) return false;
  const hay = `${p.cuisine ?? ""} ${p.tags.join(" ")}`.toLowerCase();
  return words.some((w) => w.length >= 4 && hay.includes(w));
};

interface Candidate {
  place: Place;
  score: number;
  per: number[];
}

const KIND_QUOTA: Record<PlaceKind, number> = { eat: 8, do: 7, nightlife: 5, stay: 2, move: 2 };

/**
 * The shortlist the AI chooses from: what the message asks for (kinds and specific things like
 * "steak") first, otherwise a balanced mix of the best fits per kind. Keeps big live cities manageable.
 */
const shortlist = (ranked: Candidate[], text: string, settings: TripSettings | undefined, size = 24): Candidate[] => {
  const words = keywordsOf(text);
  const asked = detectKinds(text);
  const out: Candidate[] = [];
  const push = (c: Candidate) => {
    if (out.length < size && !out.some((x) => x.place.id === c.place.id)) out.push(c);
  };
  ranked.filter((c) => mentions(c.place, words)).slice(0, 10).forEach(push);
  const kinds = asked.length ? asked : [...new Set((settings?.interests ?? []).flatMap((i) => INTEREST_BY_ID[i]?.kinds ?? []))];
  if (kinds.length) ranked.filter((c) => kinds.includes(c.place.kind)).forEach(push);
  if (!asked.length) {
    (Object.keys(KIND_QUOTA) as PlaceKind[]).forEach((k) => ranked.filter((c) => c.place.kind === k).slice(0, KIND_QUOTA[k]).forEach(push));
  }
  ranked.forEach(push);
  return out;
};

const detectLength = (text: string): number => {
  const m = text.match(/(\d{1,2})\s*-?\s*(day|night)s?\b/i);
  if (m) return Math.min(14, Math.max(1, Number(m[1]) + (m[2].toLowerCase() === "night" ? 1 : 0)));
  if (/weekend/i.test(text)) return 3;
  if (/\bweek\b/i.test(text)) return 7;
  return 4;
};

const detectStart = (text: string): Date => {
  const t = text.toLowerCase();
  const today = new Date();
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(t));
  if (mi >= 0) {
    const year = mi < today.getMonth() || (mi === today.getMonth() && today.getDate() > 10) ? today.getFullYear() + 1 : today.getFullYear();
    return new Date(year, mi, 10);
  }
  return new Date(today.getTime() + 30 * 86_400_000);
};

const explicitDay = (text: string): number | undefined => {
  const m = text.match(/\bday\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) - 1 : undefined;
};

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shortRange = (start: string, end: string): string => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return s.getMonth() === e.getMonth() ? `${m(s)} ${s.getDate()}–${e.getDate()}` : `${m(s)} ${s.getDate()}–${m(e)} ${e.getDate()}`;
};

const SLOTS: Record<PlaceKind, string[]> = {
  eat: ["12:30", "20:00", "09:00", "14:00"],
  do: ["10:00", "15:30", "17:30", "11:30"],
  nightlife: ["22:00", "21:00", "23:00"],
  stay: ["15:00"],
  move: ["09:00", "11:00"],
};

const slotsFor = (p: Place): string[] =>
  p.kind === "eat" && p.tags.some((t) => /breakfast|coffee|bakery|pastry|market/.test(t)) ? ["09:00", ...SLOTS.eat] : SLOTS[p.kind];

/**
 * Decides which day and time each pick lands on. Explicit "day N" wins, then the AI's plan,
 * otherwise picks are spread to the least-busy days. Alternatives of the same kind on a fixed
 * day are not stacked; only the top one is placed.
 */
const planPlacements = (trip: Trip, picks: Place[], userText: string, aiPlan: AiReply["plan"], cap = 5) => {
  const load = trip.days.map((d) => d.items.length);
  const lightest = (): number => load.reduce((best, n, i) => (n < load[best] ? i : best), 0);
  const used = trip.days.map((d) => new Set(d.items.map((x) => x.time)));
  const inTrip = new Set(trip.days.flatMap((d) => d.items.map((x) => x.place.id)));
  const hasStay = trip.days.some((d) => d.items.some((x) => x.place.kind === "stay"));
  const fixed = explicitDay(userText);
  const fixedDay = fixed !== undefined ? Math.min(Math.max(0, fixed), trip.days.length - 1) : undefined;
  const kindsOnFixed = new Set<PlaceKind>();
  const out: { place: Place; day: number; time: string }[] = [];

  for (const place of picks) {
    if (!sameCity(place.city, trip.city) || inTrip.has(place.id)) continue;
    if (place.kind === "stay" && (hasStay || out.some((o) => o.place.kind === "stay"))) continue;

    let day: number;
    if (place.kind === "stay") day = 0;
    else if (fixedDay !== undefined) {
      if (kindsOnFixed.has(place.kind)) continue;
      kindsOnFixed.add(place.kind);
      day = fixedDay;
    } else {
      const ai = aiPlan?.find((x) => x.id === place.id);
      if (ai && Number.isFinite(ai.day) && ai.day >= 1 && ai.day <= trip.days.length) day = ai.day - 1;
      else day = lightest();
      // Respect the trip's pace: an over-full day hands the stop to the lightest day.
      if (load[day] >= cap) day = lightest();
    }
    const ai = aiPlan?.find((x) => x.id === place.id);
    const aiTime = ai?.time && /^\d{2}:\d{2}$/.test(ai.time) && !used[day].has(ai.time) ? ai.time : undefined;
    const time = aiTime ?? slotsFor(place).find((s) => !used[day].has(s)) ?? "18:00";
    used[day].add(time);
    load[day] += 1;
    out.push({ place, day, time });
  }
  return out.slice(0, 3);
};

const profileBrief = (p: TasteProfile): string => {
  const order = sortedTypes(p.blend);
  const blend = order.map((t) => `${p.blend[t]}% ${TRAVELER_TYPES[t].short}`).join(", ");
  return [
    `Traveler name: ${p.name}`,
    `Taste Profile blend: ${blend} (${blendLabel(p.blend)})`,
    `Category coefficients (0-100): Eat ${p.categories.eat}, Do ${p.categories.do}, Stay ${p.categories.stay}, Getting around ${p.categories.move}`,
    `Loves: ${p.likes.map(tagLabel).join(", ") || "not specified"}`,
    p.dislikes.length ? `Avoids: ${p.dislikes.map(tagLabel).join(", ")}` : "",
    `Budget: ${["", "value", "mid-range, splurge on highlights", "treat myself"][p.budget] ?? "mid-range"}`,
  ]
    .filter(Boolean)
    .join("\n");
};

const settingsBrief = (s: TripSettings | undefined): string => {
  if (!s) return "";
  const parts: string[] = [];
  if (s.interests.length) parts.push(`This trip's focus (set by the traveler, weigh it heavily): ${s.interests.map((i) => `${INTEREST_BY_ID[i]?.label} (${INTEREST_BY_ID[i]?.blurb.toLowerCase()})`).join(", ")}`);
  const pace = PACES.find((p) => p.id === s.pace);
  if (pace) parts.push(`Pace: ${pace.label}, at most ${pace.cap} stops per day`);
  if (s.notes.trim()) parts.push(`Traveler notes: ${s.notes.trim().slice(0, 300)}`);
  return parts.join("\n");
};

const tripBrief = (trip: Trip | undefined): string => {
  if (!trip) return "No trip is linked to this chat yet.";
  const days = trip.days
    .map((d, i) => `Day ${i + 1}: ${d.items.map((x) => `${x.time} ${x.place.name}`).join("; ") || "empty"}`)
    .join("\n");
  return `This chat's trip: ${trip.city}, ${trip.startDate} to ${trip.endDate} (${trip.days.length} days)\n${days}`;
};

/** Local, deterministic concierge used when the AI is unreachable: the best fits from the shortlist. */
const localReply = (profile: TasteProfile, text: string, city: string, candidates: Candidate[], isGroup: boolean, people: number): AiReply => {
  const kinds = detectKinds(text);
  const words = keywordsOf(text);
  const wanted = candidates.filter((c) => (!kinds.length || kinds.includes(c.place.kind)) && (!words.length || mentions(c.place, words) || !candidates.some((x) => mentions(x.place, words))));
  const top = (wanted.length ? wanted : candidates).slice(0, 3);
  const kind = kinds[0] ? `${KIND_LABEL[kinds[0]].toLowerCase()} ` : "";
  return {
    reply: !top.length
      ? `I couldn't find more ${city} spots that fit. Try asking for a different kind of place.`
      : isGroup
        ? `Here are the ${kind}picks that work best for all ${people} of you in ${city}, ranked by group score.`
        : `As a ${blendLabel(profile.blend)} blend, here are my top ${top.length} ${kind}picks in ${city}, ranked by how well they fit your Taste Profile.`,
    pickIds: top.map((c) => c.place.id),
    suggestions: ["Swap for something cozier", "Show rooftop bars", "More like this"],
  };
};

export const [ConciergeProvider, useConcierge] = createContextHook(() => {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { trips, tripById, createTrip, placeMany, removePlaces, upsertTrip, me } = useTrips();
  const queryClient = useQueryClient();
  const [chats, setChats] = usePersistentState<ConciergeChat[]>("xp.chats.v1", []);
  const [activeId, setActiveId] = useState<string>(chats[0]?.id ?? "");
  /** City whose places are loading for the first time, for the "Finding places in…" status. */
  const [loadingCity, setLoadingCity] = useState<string | undefined>(undefined);
  const tripsRef = useRef<Trip[]>(trips);
  tripsRef.current = trips;

  const activeChat = useMemo(() => chats.find((c) => c.id === activeId), [chats, activeId]);

  const updateChat = useCallback(
    (id: string, fn: (c: ConciergeChat) => ConciergeChat) => setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c))),
    [setChats],
  );

  /** Opens a fresh chat, reusing an untouched empty one so the list doesn't fill with blanks. */
  const newChat = useCallback(
    (opts?: { tripId?: string; title?: string; cover?: string }): string => {
      const trip = tripById(opts?.tripId);
      const blank = !trip ? chats.find((c) => c.messages.length === 0 && !c.tripId) : undefined;
      if (blank) {
        setActiveId(blank.id);
        return blank.id;
      }
      const chat: ConciergeChat = {
        id: uid("chat"),
        title: opts?.title ?? (trip ? `${trip.city}, ${shortRange(trip.startDate, trip.endDate)}` : "New trip chat"),
        subtitle: trip ? "Ready to plan" : "Just started",
        cover: opts?.cover ?? trip?.cover ?? CITIES[0].cover,
        tripId: trip?.id,
        messages: [],
        updatedAt: Date.now(),
        autoPlan: true,
      };
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
      return chat.id;
    },
    [setChats, tripById, chats],
  );

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId("");
    },
    [setChats, activeId],
  );

  const renameChat = useCallback(
    (id: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      updateChat(id, (c) => ({ ...c, title: t.slice(0, 60), titleLocked: true }));
    },
    [updateChat],
  );

  const togglePin = useCallback((id: string) => updateChat(id, (c) => ({ ...c, pinned: !c.pinned })), [updateChat]);

  const setAutoPlan = useCallback((id: string, on: boolean) => updateChat(id, (c) => ({ ...c, autoPlan: on })), [updateChat]);

  /** Clears the "new stop" highlights for a chat's itinerary. */
  const markSeen = useCallback((id: string) => updateChat(id, (c) => ({ ...c, seenAt: Date.now() })), [updateChat]);

  const setSettings = useCallback(
    (id: string, settings: TripSettings) => updateChat(id, (c) => ({ ...c, settings: { ...DEFAULT_SETTINGS, ...settings, notes: settings.notes.slice(0, 400) } })),
    [updateChat],
  );

  /** Turns a chat into a live room others can join; returns the room id. */
  const startRoom = useCallback(
    (id: string): string => {
      const existing = chats.find((c) => c.id === id)?.roomId;
      if (existing) return existing;
      const roomId = randomId(12);
      updateChat(id, (c) => ({ ...c, roomId, roomVersion: 0 }));
      return roomId;
    },
    [chats, updateChat],
  );

  const leaveRoom = useCallback((id: string) => updateChat(id, (c) => ({ ...c, roomId: undefined, roomVersion: undefined })), [updateChat]);

  /** Applies the latest shared state of a live room to its local chat and trip. */
  const applyRoomDoc = useCallback(
    (chatId: string, doc: RoomDoc) => {
      if (!doc.trip) return;
      upsertTrip(doc.trip);
      const tripId = doc.trip.id;
      updateChat(chatId, (c) => {
        const messages = mergeMessages(c.messages, doc.messages ?? []);
        const newer = messages.length !== c.messages.length;
        return {
          ...c,
          tripId,
          messages,
          settings: doc.settings ?? c.settings,
          title: doc.title || c.title,
          titleLocked: doc.title ? true : c.titleLocked,
          cover: doc.trip?.cover ?? c.cover,
          roomVersion: doc.version,
          updatedAt: newer ? Date.now() : c.updatedAt,
        };
      });
    },
    [upsertTrip, updateChat],
  );

  /** Opens (or creates) the local chat for a room someone invited us to. */
  const joinRoom = useCallback(
    (roomId: string, doc: RoomDoc): string | undefined => {
      if (!doc.trip) return undefined;
      const existing = chats.find((c) => c.roomId === roomId);
      if (existing) {
        applyRoomDoc(existing.id, doc);
        setActiveId(existing.id);
        return existing.id;
      }
      upsertTrip(doc.trip);
      const chat: ConciergeChat = {
        id: uid("chat"),
        title: doc.title || `${doc.trip.city}, ${shortRange(doc.trip.startDate, doc.trip.endDate)}`,
        titleLocked: Boolean(doc.title),
        subtitle: "Shared trip",
        cover: doc.trip.cover,
        tripId: doc.trip.id,
        messages: doc.messages ?? [],
        settings: doc.settings ?? undefined,
        updatedAt: Date.now(),
        autoPlan: true,
        roomId,
        roomVersion: doc.version,
      };
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
      return chat.id;
    },
    [chats, applyRoomDoc, upsertTrip, setChats],
  );

  const linkTrip = useCallback(
    (chatId: string, tripId: string) => {
      const trip = tripById(tripId);
      updateChat(chatId, (c) => ({
        ...c,
        tripId,
        cover: trip?.cover ?? c.cover,
        title: !c.titleLocked && trip && (c.messages.length === 0 || c.title === "New trip chat") ? `${trip.city}, ${shortRange(trip.startDate, trip.endDate)}` : c.title,
      }));
    },
    [tripById, updateChat],
  );

  /** Removes the stops a single concierge reply added. */
  const undoPlanned = useCallback(
    (chatId: string, messageId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      const msg = chat?.messages.find((m) => m.id === messageId);
      if (!msg?.planned || msg.planned.undone) return;
      removePlaces(msg.planned.tripId, msg.planned.items.map((i) => ({ placeId: i.placeId, day: i.day - 1 })));
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId && m.planned ? { ...m, planned: { ...m.planned, undone: true } } : m)),
      }));
    },
    [chats, removePlaces, updateChat],
  );

  const mutation = useMutation({
    mutationFn: async (vars: { chatId: string; text: string; trip?: Trip; createdTrip: boolean; autoPlan: boolean; settings?: TripSettings; mates?: GroupMate[] }) => {
      const chat = chats.find((c) => c.id === vars.chatId);
      let trip = vars.trip;
      let createdTrip = vars.createdTrip;
      const tuned = applyTripSettings(profile, vars.settings);

      // Which city: a hand-picked one named in the message, the chat's trip, or any city in the world.
      let city = findCity(vars.text) ?? trip?.city;
      let cityData: CityPlaces | undefined;
      try {
        if (!city) {
          for (const guess of guessCities(vars.text)) {
            setLoadingCity(guess);
            try {
              cityData = await queryClient.fetchQuery(cityPlacesQuery(guess));
              city = cityData.city.name;
              break;
            } catch (e) {
              console.info("[concierge] not a city we could load", guess, e instanceof Error ? e.message : e);
            }
          }
        }
        if (city && !cityData) {
          if (!queryClient.getQueryData(cityPlacesQuery(city).queryKey)) setLoadingCity(city);
          try {
            cityData = await queryClient.fetchQuery(cityPlacesQuery(city));
          } catch (e) {
            console.warn("[concierge] live places unavailable, using hand-picked ones", e instanceof Error ? e.message : e);
          }
        }
      } finally {
        setLoadingCity(undefined);
      }
      city = city ?? "Lisbon";
      const pool = cityData?.places ?? curatedFor(city);

      // A brand-new city starts its own trip, with the real map position and cover photo.
      if (!trip && vars.autoPlan && cityData && !CITIES.some((c) => sameCity(c.name, city ?? ""))) {
        const start = detectStart(vars.text);
        const end = new Date(start.getTime() + (detectLength(vars.text) - 1) * 86_400_000);
        const info = cityData.city;
        const made = createTrip(info.name, iso(start), iso(end), { country: info.country, center: info.center, cover: info.cover, blurb: info.blurb ?? undefined, located: true });
        trip = made;
        createdTrip = true;
        updateChat(vars.chatId, (c) => ({
          ...c,
          tripId: made.id,
          cover: made.cover,
          title: c.titleLocked ? c.title : `${made.city}, ${shortRange(made.startDate, made.endDate)}`,
        }));
      }

      const already = new Set<string>();
      chat?.messages.slice(-4).forEach((m) => m.picks?.forEach((p) => already.add(p.id)));
      const askingMore = /\b(more|other|else|different|swap|instead)\b/i.test(vars.text);
      const planning = Boolean(vars.autoPlan && trip && sameCity(trip.city, city));
      const inTrip = new Set(trip?.days.flatMap((d) => d.items.map((x) => x.place.id)) ?? []);

      const mates = (vars.mates ?? []).map((m) => ({ name: m.name, profile: applyTripSettings(m.profile, vars.settings) }));
      const isGroup = mates.length > 0;
      const ranked: Candidate[] = pool
        .filter((p) => !inTrip.has(p.id) && !(askingMore && already.has(p.id)))
        .map((place) => {
          const per = [scorePlace(tuned, place).score, ...mates.map((m) => scorePlace(m.profile, place).score)];
          return { place, per, score: isGroup ? groupScore(per) : per[0] };
        })
        .sort((a, b) => b.score - a.score);
      const candidates = shortlist(ranked, vars.text, vars.settings);
      const names = [profile.name, ...mates.map((m) => m.name)];
      const catalog = candidates
        .map(
          ({ place, score, per }) =>
            `${place.id} | ${place.name} | ${KIND_LABEL[place.kind]}${place.cuisine ? ` (${place.cuisine})` : ""} | ${place.neighborhood || "—"} | ${"$".repeat(place.price)} | ${isGroup ? `group ${score}% (${per.map((s, i) => `${names[i]} ${s}`).join(", ")})` : `match ${score}%`} | ${place.source === "osm" ? "live" : "curated"} | tags: ${place.tags.join(", ")} | ${place.blurb}`,
        )
        .join("\n");
      const groupBrief = isGroup
        ? `\nThis is a GROUP trip with ${names.join(", ")}. Rank for the group: the group score is half the average and half the lowest person's score, so prefer places everyone likes over places one person loves and another dislikes. Mention when a pick splits the group.\n${mates.map((m) => `--- ${m.name}'s Taste Profile ---\n${profileBrief(m.profile)}`).join("\n")}`
        : "";

      const system = `You are the XP Match concierge, a warm, sharp travel planner. Every chat is one trip: what you pick gets placed on that trip's itinerary automatically. XP Match personalizes every pick to the traveler's Taste Profile: a blend of four traveler types (Trailblazer: bold/social/spontaneous; Architect: driven/efficient/planned; Curator: curious/detailed/discerning; Drifter: easygoing/cozy/unhurried) plus category coefficients for Eat, Do, Stay and Getting around, plus specific likes. Two people who both like steak should NOT get the same steakhouse: match the vibe of the place to their blend.

${profileBrief(profile)}${groupBrief}
${settingsBrief(vars.settings)}

${tripBrief(trip)}${createdTrip ? "\n(This trip was just created from this message. Briefly mention you started the itinerary.)" : ""}

Candidate places in ${city}, pre-ranked by our match engine ("curated" = hand-checked by XP Match, "live" = from OpenStreetMap with short factual descriptions):
${catalog || "(none available right now)"}

Rules:
- Reply ONLY with a JSON object: {"reply": string, "pickIds": string[], "plan": [{"id": string, "day": number, "time": "HH:MM"}], "suggestions": string[]}.
- "reply": 1-3 short, friendly sentences. Reference their blend or tastes naturally (e.g. "As a Curator-Drifter..."). No markdown, no lists, never list the picks by name in the reply because they render as cards.
- "pickIds": 0-3 ids chosen ONLY from the candidate list that best answer the request. Prefer higher match % unless the request says otherwise. When the request is open-ended, lean into the trip's focus. ${askingMore ? `Avoid these recently shown ids: ${[...already].join(", ") || "none"}.` : ""}
- "plan": ${planning ? "for each pick, the 1-based trip day and a sensible local time that fits around what's already planned (meals at meal times, sunsets late afternoon, bars late). Don't double-book a time slot. Spread picks across days that are light and never exceed the pace limit per day." : "return an empty array."}
- For "live" places, only state what the listing says (type, cuisine, neighborhood). Never invent dishes, awards, history or reviews for them.
- If the user asks a general question (weather, tips, logistics), answer it and return empty pickIds and plan.
- "suggestions": exactly 3 short follow-up prompts (max 5 words each) the user might tap next.`;

      const history = (chat?.messages ?? []).slice(-10).map((m) => ({
        role: m.role,
        content:
          m.role === "assistant" && m.picks?.length
            ? `${m.text} [showed: ${m.picks.map((p) => p.name).join(", ")}]`
            : isGroup && m.authorName
              ? `${m.authorName}${m.toGroup ? " (to the group)" : ""}: ${m.text}`
              : m.text,
      }));

      let result: AiReply;
      try {
        result = await chatJson<AiReply>([{ role: "system", content: system }, ...history, { role: "user", content: vars.text }]);
        if (typeof result.reply !== "string") throw new Error("bad reply");
      } catch (e) {
        console.warn("[concierge] AI unavailable, using local matcher", e instanceof Error ? e.message : e);
        result = localReply(tuned, vars.text, city, candidates, isGroup, names.length);
      }
      const byId = new Map(pool.map((p) => [p.id, p]));
      const picks = (result.pickIds ?? []).map((id) => byId.get(id)).filter((p): p is Place => Boolean(p)).slice(0, 3);
      return { vars, result, picks, planning, trip, createdTrip };
    },
    onSuccess: ({ vars, result, picks, planning, trip: usedTrip, createdTrip }) => {
      let planned: PlannedUpdate | undefined;
      const trip = usedTrip ? (tripsRef.current.find((t) => t.id === usedTrip.id) ?? usedTrip) : undefined;
      if (planning && trip && picks.length) {
        const placements = planPlacements(trip, picks, vars.text, Array.isArray(result.plan) ? result.plan : undefined, paceCap(vars.settings?.pace));
        if (placements.length) {
          placeMany(trip.id, placements, XP_AUTHOR);
          planned = {
            tripId: trip.id,
            created: createdTrip,
            items: placements.map((p) => ({ placeId: p.place.id, name: p.place.name, day: p.day + 1, time: p.time })),
          };
        }
      }
      if (!planned && createdTrip && trip) planned = { tripId: trip.id, created: true, items: [] };
      const msg: ChatPickMessage = {
        id: uid("m"),
        role: "assistant",
        text: result.reply,
        picks,
        suggestions: (result.suggestions ?? []).filter((s) => typeof s === "string").slice(0, 3),
        createdAt: Date.now(),
        planned,
      };
      updateChat(vars.chatId, (c) => ({ ...c, messages: [...c.messages, msg], updatedAt: Date.now() }));
    },
    onError: (_err, vars) => {
      updateChat(vars.chatId, (c) => ({
        ...c,
        messages: [
          ...c.messages,
          { id: uid("m"), role: "assistant", text: "Something went wrong reaching the concierge. Try sending that again.", createdAt: Date.now(), error: true },
        ],
      }));
    },
  });

  /** Posts a message to the other people on a shared trip without asking XP. */
  const sendToGroup = useCallback(
    (chatId: string, text: string) => {
      const body = text.trim().slice(0, 2000);
      if (!body) return;
      updateChat(chatId, (c) => ({
        ...c,
        subtitle: `${me.label}: ${body.slice(0, 32)}`,
        messages: [...c.messages, { id: uid("m"), role: "user", text: body, createdAt: Date.now(), authorId: me.id, authorName: me.label, authorAvatar: user?.picture, toGroup: true }],
        updatedAt: Date.now(),
      }));
    },
    [updateChat, me, user?.picture],
  );

  /** Sends a message; starts this chat's trip automatically the first time a destination comes up. */
  const send = useCallback(
    (text: string, chatIdOverride?: string, tripIdHint?: string, mates?: GroupMate[]): string | undefined => {
      const body = text.trim();
      // Chats belong to an account, so the concierge only runs for signed-in people.
      if (!body || mutation.isPending || !user) return undefined;
      const chatId = chatIdOverride ?? activeChat?.id ?? newChat();
      const chat = chats.find((c) => c.id === chatId);
      const autoPlan = chat?.autoPlan !== false;
      let trip = tripById(chat?.tripId ?? tripIdHint);
      let createdTrip = false;
      const city = findCity(body);

      if (!trip && autoPlan && city) {
        const start = detectStart(body);
        const end = new Date(start.getTime() + (detectLength(body) - 1) * 86_400_000);
        trip = createTrip(city, iso(start), iso(end));
        createdTrip = true;
      }

      updateChat(chatId, (c) => {
        const first = c.messages.length === 0;
        const autoTitle =
          !c.titleLocked && trip && (createdTrip || first)
            ? `${trip.city}, ${shortRange(trip.startDate, trip.endDate)}`
            : !c.titleLocked && first && c.title === "New trip chat"
              ? body.slice(0, 32) + (body.length > 32 ? "…" : "")
              : c.title;
        return {
          ...c,
          tripId: trip?.id ?? c.tripId,
          cover: createdTrip && trip ? trip.cover : c.cover,
          title: autoTitle,
          subtitle: body.slice(0, 40) + (body.length > 40 ? "…" : ""),
          messages: [...c.messages, { id: uid("m"), role: "user", text: body, createdAt: Date.now(), authorId: me.id, authorName: me.label, authorAvatar: user?.picture }],
          updatedAt: Date.now(),
          seenAt: Date.now(),
        };
      });
      mutation.mutate({ chatId, text: body, trip, createdTrip, autoPlan, settings: chat?.settings, mates });
      return chatId;
    },
    [mutation, activeChat, newChat, updateChat, chats, tripById, createTrip, me, user],
  );

  const sortedChats = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);

  return {
    chats: sortedChats,
    activeChat,
    activeId,
    setActiveId,
    newChat,
    deleteChat,
    renameChat,
    togglePin,
    setAutoPlan,
    setSettings,
    markSeen,
    startRoom,
    leaveRoom,
    applyRoomDoc,
    joinRoom,
    linkTrip,
    undoPlanned,
    send,
    sendToGroup,
    isThinking: mutation.isPending,
    loadingCity,
    pendingChatId: mutation.isPending ? mutation.variables?.chatId : undefined,
  };
});
