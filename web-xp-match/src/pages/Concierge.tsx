import {
  ArrowRight,
  ArrowUp,
  CalendarPlus,
  Check,
  Compass,
  Loader2,
  Map as MapIcon,
  MessageSquarePlus,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  UserPlus,
  UtensilsCrossed,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ChatSidePanel, type PanelView } from "@/components/xp/chat/ChatSidePanel";
import { ChatSignInGate } from "@/components/xp/ChatSignInGate";
import { PlaceCard } from "@/components/xp/PlaceCard";
import { ShareDialog } from "@/components/xp/ShareDialog";
import { dayColor } from "@/components/xp/TripMap";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { TripMembers } from "@/components/xp/TripMembers";
import { useTripPeople } from "@/hooks/use-trip-people";
import { TripSettingsDialog } from "@/components/xp/TripSettingsDialog";
import { INTEREST_BY_ID } from "@/data/interests";
import { CITIES, PLACE_BY_ID } from "@/data/places";
import { IMG } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { ChatPickMessage, ConciergeChat, Place, Trip } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useSync } from "@/providers/SyncProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { formatRange, useTrips } from "@/providers/TripsProvider";

/** True at the width where the side map sits next to the chat (Tailwind xl). */
function useWide(): boolean {
  const query = "(min-width: 1280px)";
  const [wide, setWide] = useState<boolean>(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setWide(mql.matches);
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Callbacks the chat uses to drive the side map panel. */
interface PanelControls {
  openPlace: (place: Place) => void;
  openItinerary: (day?: number) => void;
  focusedPlaceId?: string;
}

const STARTERS = [
  { text: "4 days in Lisbon in October. Great steak, nothing touristy.", cover: IMG.miradouro },
  { text: "A long weekend in Porto with hidden gems and port wine", cover: IMG.porto },
  { text: "5 days in Tokyo for a food lover who hates crowds", cover: IMG.tokyo },
  { text: "Plan a slow, cozy week in Lisbon for two", cover: IMG.tram },
];

const timeOf = (ms: number): string => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Chat-first home. Signed-out visitors see the sign-in gate; chats belong to an account. */
export default function Concierge() {
  const { user, isLoading } = useAuth();
  const { isReady } = useSync();
  if (isLoading || (user && !isReady)) {
    return (
      <div className="grid min-h-[calc(100vh-var(--topbar))] place-items-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Loading your chats" />
      </div>
    );
  }
  if (!user) return <ChatSignInGate />;
  return <ConciergeChats />;
}

/** Every chat is a trip, and its itinerary builds itself as you talk. */
function ConciergeChats() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { chats, activeChat, setActiveId, send, sendToGroup, isThinking, pendingChatId } = useConcierge();
  const [railOpen, setRailOpen] = useState<boolean>(false);
  const [view, setView] = useState<PanelView>({ kind: "trip" });
  const [dayFilter, setDayFilter] = useState<"all" | number>("all");
  const wide = useWide();

  useEffect(() => {
    setView({ kind: "trip" });
    setDayFilter("all");
  }, [id]);

  useEffect(() => {
    if (!id) {
      setActiveId("");
      return;
    }
    if (chats.some((c) => c.id === id)) setActiveId(id);
    else navigate("/", { replace: true });
  }, [id, chats, setActiveId, navigate]);

  const chat = id ? activeChat : undefined;
  const people = useTripPeople(chat);

  const onSend = (text: string, toGroup?: boolean) => {
    if (toGroup && chat) {
      sendToGroup(chat.id, text);
      return;
    }
    const mates = people.filter((p) => !p.isMe).map((p) => ({ name: p.name, profile: p.profile }));
    const chatId = send(text, chat?.id, undefined, mates.length ? mates : undefined);
    if (chatId && chatId !== id) navigate(`/c/${chatId}`);
  };

  const openPlace = useCallback(
    (place: Place) => {
      setView({ kind: "place", place, nonce: Date.now() });
      if (!wide) setRailOpen(true);
    },
    [wide],
  );

  const openItinerary = useCallback(
    (day?: number) => {
      setView({ kind: "trip" });
      if (day !== undefined) setDayFilter(day);
      if (!wide) setRailOpen(true);
    },
    [wide],
  );

  // Requests from the panel ("Fill this day", "More like this") always go to XP, then return to the chat.
  const ask = (text: string) => {
    setRailOpen(false);
    onSend(text, false);
  };

  const controls: PanelControls = { openPlace, openItinerary, focusedPlaceId: view.kind === "place" ? view.place.id : undefined };
  const panel = (inSheet: boolean) => <ChatSidePanel chat={chat} view={view} onView={setView} dayFilter={dayFilter} onDayFilter={setDayFilter} onAsk={ask} closeSpace={inSheet} />;

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <ChatThread chat={chat} onSend={onSend} thinking={isThinking && !!chat && pendingChatId === chat.id} controls={controls} />
      <aside className="hidden h-[calc(100vh-var(--topbar))] overflow-hidden border-l border-border/70 bg-[hsl(40_45%_97%)] xl:sticky xl:top-[var(--topbar)] xl:block" aria-label="Trip map and itinerary">
        {wide ? panel(false) : null}
      </aside>
      <Sheet open={railOpen && !wide} onOpenChange={setRailOpen}>
        <SheetContent side="right" className="flex w-[94vw] flex-col bg-background p-0 sm:max-w-[440px]">
          <SheetTitle className="sr-only">Trip map and itinerary</SheetTitle>
          {!wide ? panel(true) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChatHeader({ chat, trip, onOpenItinerary }: { chat: ConciergeChat; trip?: Trip; onOpenItinerary: () => void }) {
  const { renameChat, setAutoPlan } = useConcierge();
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const interests = chat.settings?.interests ?? [];
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(chat.title);
  const stops = trip ? trip.days.reduce((n, d) => n + d.items.length, 0) : 0;
  const autoPlan = chat.autoPlan !== false;

  useEffect(() => setDraft(chat.title), [chat.title]);

  const commit = () => {
    renameChat(chat.id, draft);
    setEditing(false);
  };

  return (
    <header className="sticky top-[var(--topbar)] z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 bg-background/90 px-4 py-3.5 backdrop-blur-md sm:px-8">
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(chat.title);
                setEditing(false);
              }
            }}
            aria-label="Chat name"
            className="h-9 w-full max-w-md rounded-md border border-primary/60 bg-card px-2 font-display text-[22px] font-semibold text-secondary outline-none"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="group flex max-w-full items-center gap-2 text-left" aria-label={`Rename ${chat.title}`}>
            <h1 className="truncate text-[24px] font-semibold leading-tight text-secondary">{chat.title}</h1>
            <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {trip ? `${formatRange(trip.startDate, trip.endDate)} · ${trip.days.length} days · ${stops} stops planned` : "Mention a city and dates to start this trip's itinerary"}
        </p>
        {interests.length ? (
          <button type="button" onClick={() => setSettingsOpen(true)} className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Edit trip focus">
            {interests.map((i) => {
              const def = INTEREST_BY_ID[i];
              if (!def) return null;
              const Icon = def.icon;
              return (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[12px] font-semibold text-secondary-foreground">
                  <Icon className="size-3" /> {def.label}
                </span>
              );
            })}
          </button>
        ) : null}
      </div>
      <TripMembers chat={chat} onManage={() => setSettingsOpen(true)} />
      <label className="flex items-center gap-2 text-[13px] font-medium text-foreground/75">
        <Switch checked={autoPlan} onCheckedChange={(v) => setAutoPlan(chat.id, v)} aria-label="Auto-build itinerary" />
        Auto-plan
      </label>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Trip settings"
        className={cn("press relative grid size-10 place-items-center rounded-xl border bg-card hover:bg-muted", interests.length ? "border-secondary/40" : "border-border")}
      >
        <SlidersHorizontal className="size-4" />
        {interests.length ? <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{interests.length}</span> : null}
      </button>
      {trip ? (
        <button type="button" onClick={() => setShareOpen(true)} className="press inline-flex h-10 items-center gap-2 rounded-xl bg-secondary px-3.5 text-sm font-semibold text-secondary-foreground hover:bg-secondary/90">
          <UserPlus className="size-4" /> <span className="hidden sm:inline">Invite</span>
        </button>
      ) : null}
      <TripSettingsDialog chat={chat} open={settingsOpen} onOpenChange={setSettingsOpen} />
      {trip ? <ShareDialog trip={trip} chat={chat} open={shareOpen} onOpenChange={setShareOpen} /> : null}
      {trip ? (
        <>
          <Link to={`/discover?chat=${chat.id}`} className="press inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted">
            <Compass className="size-4 text-primary" /> <span className="hidden sm:inline">Discover</span>
          </Link>
          <button type="button" onClick={onOpenItinerary} className="press inline-flex h-10 items-center gap-2 rounded-xl border border-primary/50 px-3.5 text-sm font-semibold text-primary hover:bg-accent">
            <MapIcon className="size-4" /> Itinerary
          </button>
        </>
      ) : null}
    </header>
  );
}

function PlannedReceipt({ chatId, msg, controls }: { chatId: string; msg: ChatPickMessage; controls: PanelControls }) {
  const { undoPlanned } = useConcierge();
  const { tripById } = useTrips();
  const p = msg.planned;
  if (!p) return null;
  const trip = tripById(p.tripId);
  if (!trip) return null;
  const firstDay = p.items[0]?.day ?? 1;

  return (
    <div className={cn("ml-0 mt-4 overflow-hidden rounded-xl border sm:ml-16", p.undone ? "border-border bg-muted/40" : "border-primary/30 bg-accent/60")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", p.undone ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
          {p.undone ? <Undo2 className="size-4" /> : p.created && !p.items.length ? <CalendarPlus className="size-4" /> : <Check className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-secondary">
            {p.undone
              ? "Removed from your itinerary"
              : p.items.length
                ? `${p.created ? `Started your ${trip.city} trip · ` : ""}Added ${p.items.length} ${p.items.length === 1 ? "stop" : "stops"} to your itinerary`
                : `Started your ${trip.city} trip · ${formatRange(trip.startDate, trip.endDate)}`}
          </p>
          {p.items.length ? (
            <p className={cn("mt-1 flex flex-wrap gap-1.5 text-[13px] text-foreground/75", p.undone && "line-through")}>
              {p.items.map((i) => {
                const place = PLACE_BY_ID[i.placeId] ?? trip.days.flatMap((d) => d.items).find((x) => x.place.id === i.placeId)?.place;
                const label = `Day ${i.day}${i.time ? ` ${i.time}` : ""} · ${i.name}`;
                return place && !p.undone ? (
                  <button
                    key={i.placeId}
                    type="button"
                    onClick={() => controls.openPlace(place)}
                    className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 font-medium hover:bg-background hover:text-foreground"
                  >
                    <span className="size-1.5 rounded-full" style={{ background: dayColor(i.day - 1) }} />
                    {label}
                  </button>
                ) : (
                  <span key={i.placeId} className="px-1 py-1">
                    {label}
                  </span>
                );
              })}
            </p>
          ) : null}
        </div>
        {!p.undone ? (
          <div className="flex items-center gap-1">
            {p.items.length ? (
              <button type="button" onClick={() => undoPlanned(chatId, msg.id)} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground/70 hover:bg-background/70 hover:text-foreground">
                Undo
              </button>
            ) : null}
            <button type="button" onClick={() => controls.openItinerary(firstDay - 1)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-background/70">
              View day {firstDay} <ArrowRight className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatThread({ chat, onSend, thinking, controls }: { chat?: ConciergeChat; onSend: (t: string, toGroup?: boolean) => void; thinking: boolean; controls: PanelControls }) {
  const { profile } = useProfile();
  const { tripById, me } = useTrips();
  const people = useTripPeople(chat);
  const isGroup = Boolean(chat?.roomId) && people.length > 1;
  const [toGroup, setToGroup] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = chat?.messages ?? [];
  const trip = tripById(chat?.tripId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, chat?.id]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chat?.id]);

  const submit = (text: string, forceXp?: boolean) => {
    const group = isGroup && toGroup && !forceXp;
    if (!text.trim() || (thinking && !group)) return;
    onSend(text, group);
    setInput("");
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <section className="flex min-h-[calc(100vh-var(--topbar))] min-w-0 flex-col" aria-label="Concierge chat">
      {chat && messages.length > 0 ? <ChatHeader chat={chat} trip={trip} onOpenItinerary={() => controls.openItinerary()} /> : null}
      <div className="mx-auto w-full max-w-[980px] flex-1 space-y-6 px-4 pb-6 pt-8 sm:px-8" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl pt-6 text-center animate-rise sm:pt-14">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-secondary font-display text-2xl font-semibold text-secondary-foreground">XP</div>
            <h1 className="mt-6 text-4xl font-semibold text-secondary sm:text-[52px] sm:leading-[1.05]">Where are we going, {profile.name}?</h1>
            <p className="mx-auto mt-4 max-w-lg text-lg text-foreground/70">Every chat is a trip. Tell me the city and dates, and I'll build the itinerary as we talk, matched to your Taste Profile.</p>
            <div className="mt-9 grid gap-3 text-left sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => submit(s.text)}
                  className="press surface group flex items-center gap-3 p-2.5 pr-4 text-[14.5px] leading-snug transition-colors hover:border-primary/50 animate-rise"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <img src={s.cover} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                  <span className="flex-1">{s.text}</span>
                  <ArrowRight className="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Curated picks for {CITIES.map((c) => c.name).join(", ")}.</p>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === "user" && m.authorId && m.authorId !== me.id ? (
            <div key={m.id} className="flex flex-col items-start animate-rise">
              <div className="flex items-start gap-3">
                <PersonAvatar name={m.authorName ?? "Traveler"} src={m.authorAvatar} className="size-11 text-lg" />
                <div>
                  <p className="mb-1 text-[12.5px] font-semibold text-foreground/70">
                    {m.authorName ?? "Someone"}
                    {m.toGroup ? <span className="ml-1.5 font-normal text-muted-foreground">to the group</span> : <span className="ml-1.5 font-normal text-muted-foreground">asked XP</span>}
                  </p>
                  <p className="max-w-[560px] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-secondary/15 bg-secondary/[0.07] px-5 py-3.5 text-[16px]">{m.text}</p>
                </div>
              </div>
              <span className="ml-14 mt-2 text-xs text-muted-foreground">{timeOf(m.createdAt)}</span>
            </div>
          ) : m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end animate-rise">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-end">
                  {m.toGroup ? <p className="mb-1 text-[12px] font-medium text-muted-foreground">To the group</p> : null}
                  <p className={cn("max-w-[560px] whitespace-pre-wrap rounded-2xl rounded-tr-md px-5 py-3.5 text-[16px] shadow-sm", m.toGroup ? "border border-primary/30 bg-accent text-foreground" : "bg-primary text-primary-foreground")}>{m.text}</p>
                </div>
                <PersonAvatar name={profile.name} src={m.authorAvatar} className="hidden size-11 text-lg sm:inline-grid" />
              </div>
              <span className="mt-2 text-xs text-muted-foreground sm:mr-14">{timeOf(m.createdAt)}</span>
            </div>
          ) : (
            <div key={m.id} className="animate-rise">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-display text-lg font-semibold text-secondary-foreground">XP</div>
                <p className={cn("max-w-[600px] rounded-2xl rounded-tl-md px-5 py-3.5 text-[16px] leading-relaxed", m.error ? "bg-destructive/10 text-destructive" : "bg-muted/80")}>{m.text}</p>
              </div>
              <span className="ml-14 mt-2 block text-xs text-muted-foreground">{timeOf(m.createdAt)}</span>
              {m.picks && m.picks.length > 0 ? (
                <div className="mt-4 grid gap-4 sm:ml-14 sm:grid-cols-2 2xl:grid-cols-3">
                  {m.picks.map((p, i) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      tripId={chat?.tripId}
                      index={i}
                      people={isGroup ? people : undefined}
                      onOpen={controls.openPlace}
                      active={controls.focusedPlaceId === p.id}
                    />
                  ))}
                </div>
              ) : null}
              {chat ? <PlannedReceipt chatId={chat.id} msg={m} controls={controls} /> : null}
              {m.id === lastAssistant?.id && m.suggestions && m.suggestions.length > 0 && !thinking ? (
                <div className="mt-5 flex flex-wrap gap-2.5 sm:ml-14">
                  {m.suggestions.map((s, i) => {
                    const Icon = [Wand2, UtensilsCrossed, Sparkles][i % 3];
                    return (
                      <button key={s} type="button" onClick={() => submit(s, true)} className="press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[14.5px] font-medium hover:border-primary/50 hover:bg-accent">
                        <Icon className="size-4" /> {s}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ),
        )}

        {thinking ? (
          <div className="flex items-center gap-3 animate-rise">
            <div className="grid size-11 place-items-center rounded-full bg-secondary font-display text-lg font-semibold text-secondary-foreground">XP</div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-muted/80 px-5 py-4" aria-label="Concierge is planning">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot size-2 rounded-full bg-foreground/50" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
              <span className="ml-2 text-sm text-muted-foreground">{chat?.autoPlan !== false ? "Matching picks and planning your days…" : "Matching to your taste…"}</span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-5 pt-6 sm:px-8">
        {isGroup ? (
          <div className="mx-auto mb-2 flex max-w-[980px] items-center gap-2">
            <div role="radiogroup" aria-label="Who gets this message" className="flex gap-0.5 rounded-full bg-muted p-0.5 text-[13px] font-semibold">
              {([false, true] as const).map((g) => (
                <button key={String(g)} type="button" role="radio" aria-checked={toGroup === g} onClick={() => setToGroup(g)} className={cn("rounded-full px-3 py-1.5 transition-colors", toGroup === g ? (g ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground") : "text-foreground/65 hover:text-foreground")}>
                  {g ? "Group only" : "Ask XP"}
                </button>
              ))}
            </div>
            <span className="truncate text-[12.5px] text-muted-foreground">
              {toGroup ? `Only ${people.filter((p) => !p.isMe).map((p) => p.name.split(" ")[0]).join(", ")} will see this. XP stays quiet.` : `XP picks for all ${people.length} of you.`}
            </span>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mx-auto flex max-w-[980px] items-end gap-2 rounded-2xl border border-border bg-card p-2 pl-4 shadow-[0_14px_36px_-20px_hsl(222_37%_19%/0.35)] focus-within:border-primary/60"
        >
          <MessageSquarePlus className="mb-3.5 size-5 shrink-0 text-muted-foreground" />
          <span className="mx-1 mb-2.5 h-7 w-px bg-border" />
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder={isGroup && toGroup ? "Message the group…" : trip ? `Ask anything about your ${trip.city} trip…` : "Where to, and when? e.g. 4 days in Lisbon in October"}
            aria-label="Message the concierge"
            className="max-h-40 min-h-12 flex-1 resize-none bg-transparent py-3 text-[16px] leading-6 outline-none placeholder:text-foreground/45 [field-sizing:content]"
          />
          <button type="submit" disabled={!input.trim() || (thinking && !(isGroup && toGroup))} aria-label="Send" className="press grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40">
            <ArrowUp className="size-5" />
          </button>
        </form>
      </div>
    </section>
  );
}
