import {
  Bell,
  Cloud,
  CloudOff,
  Compass,
  Loader2,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  ListOrdered,
  Luggage,
  MessageSquareHeart,
  ShieldCheck,
  MessagesSquare,
  Newspaper,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLACE_BY_ID } from "@/data/places";
import { blendLabel } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { ConciergeChat, Trip } from "@/lib/types";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { DeleteAccountDialog } from "@/components/xp/DeleteAccountDialog";
import { useFeedback } from "@/components/xp/FeedbackDialog";
import { APP_VERSION } from "@/lib/beta";
import { useAuth } from "@/providers/AuthProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useList } from "@/providers/ListProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";
import { useSync } from "@/providers/SyncProvider";
import { freshItemIds, useTrips } from "@/providers/TripsProvider";

const DAY = 86_400_000;

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn("font-display text-[26px] font-semibold leading-none tracking-tight", className)} aria-label="XP Match home">
      <span className="text-primary">XP</span>
      {compact ? null : <span className="text-secondary"> Match</span>}
    </Link>
  );
}

const relTime = (ms: number): string => {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : `${Math.round(d / 7)}w`;
};

const groupOf = (c: ConciergeChat): string => {
  if (c.pinned) return "Pinned";
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (c.updatedAt >= startOfToday) return "Today";
  if (c.updatedAt >= startOfToday - 6 * DAY) return "This week";
  return "Earlier";
};

const GROUP_ORDER = ["Pinned", "Today", "This week", "Earlier"];

/** Passport-stamp colors, shared with the trip member palette. */
const STAMP_COLORS = ["#C8452D", "#1F2A44", "#5E9C7C", "#D9A43A", "#4A6FA5", "#E08A6A"];

const stampColor = (seed: string): string => {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return STAMP_COLORS[h % STAMP_COLORS.length];
};

const startOfToday = (): number => new Date().setHours(0, 0, 0, 0);
const dayMs = (iso: string): number => new Date(`${iso}T00:00:00`).getTime();

const shortDates = (start: string, end: string): string => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (start === end) return `${m(s)} ${s.getDate()}`;
  return s.getMonth() === e.getMonth() ? `${m(s)} ${s.getDate()}–${e.getDate()}` : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}`;
};

/** "In 9 days", "Happening now", "Past trip"… */
const countdown = (t: Trip): { label: string; tone: "soon" | "now" | "later" | "past" } => {
  const today = startOfToday();
  const s = dayMs(t.startDate);
  if (today > dayMs(t.endDate)) return { label: "Past trip", tone: "past" };
  if (today >= s) return { label: "Happening now", tone: "now" };
  const d = Math.round((s - today) / DAY);
  if (d === 1) return { label: "Tomorrow", tone: "soon" };
  if (d <= 14) return { label: `In ${d} days`, tone: "soon" };
  return { label: d < 60 ? `In ${d} days` : `In ${Math.round(d / 30)} months`, tone: "later" };
};

const isUpcoming = (t?: Trip): boolean => Boolean(t && dayMs(t.endDate) >= startOfToday());

type ChatFilter = "all" | "upcoming" | "shared";

/** A city "stamp": 3-letter code on a tinted tile, so trips are easy to tell apart at a glance. */
function CityStamp({ chat, trip, active, className }: { chat: ConciergeChat; trip?: Trip; active?: boolean; className?: string }) {
  const label = trip ? trip.city.replace(/[^\p{L}]/gu, "").slice(0, 3).toUpperCase() : (chat.title.trim()[0] ?? "·").toUpperCase();
  const color = trip ? stampColor(trip.city) : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl font-display font-semibold leading-none",
        trip ? "text-white" : active ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground/60",
        className,
      )}
      style={color ? { backgroundColor: color, boxShadow: `inset 0 0 0 2px ${color}, inset 0 0 0 3.5px rgba(255,255,255,0.35)` } : undefined}
    >
      <span className={trip ? "text-[13px] tracking-[0.08em]" : "text-[17px]"}>{label}</span>
    </span>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}

/** App-wide side menu: new chat, searchable trip chats, sections, and account. */
export function Sidebar({ collapsed = false, onToggleCollapsed, onNavigate }: SidebarProps) {
  const { chats, activeId, pendingChatId } = useConcierge();
  const { user } = useAuth();
  const { trips, me } = useTrips();
  const { unreadTotal } = useSocial();
  const { ranked } = useList();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (collapsed) onToggleCollapsed?.();
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, onToggleCollapsed]);

  const tripMap = useMemo(() => new Map<string, Trip>(trips.map((t) => [t.id, t])), [trips]);
  const onChatRoute = location.pathname === "/" || location.pathname.startsWith("/c/");

  const visible = useMemo(() => chats.filter((c) => c.messages.length > 0 || c.id === activeId), [chats, activeId]);

  const counts = useMemo(
    () => ({
      all: visible.length,
      upcoming: visible.filter((c) => isUpcoming(tripMap.get(c.tripId ?? ""))).length,
      shared: visible.filter((c) => Boolean(c.roomId)).length,
    }),
    [visible, tripMap],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible
      .filter((c) => {
        if (q || filter === "all") return true;
        if (filter === "shared") return Boolean(c.roomId);
        return isUpcoming(tripMap.get(c.tripId ?? ""));
      })
      .map((c) => {
        if (!q) return { chat: c, snippet: undefined as string | undefined };
        const trip = tripMap.get(c.tripId ?? "");
        if (c.title.toLowerCase().includes(q) || trip?.city.toLowerCase().includes(q)) return { chat: c, snippet: undefined };
        const hit = c.messages.find((m) => m.text.toLowerCase().includes(q) || m.picks?.some((p) => p.name.toLowerCase().includes(q)));
        if (!hit) return null;
        const pick = hit.picks?.find((p) => p.name.toLowerCase().includes(q));
        return { chat: c, snippet: pick ? `Pick: ${pick.name}` : hit.text };
      })
      .filter((x): x is { chat: ConciergeChat; snippet: string | undefined } => x !== null);
  }, [visible, query, tripMap, filter]);

  const groups = useMemo(() => {
    if (query.trim()) return results.length ? [["Results", results] as const] : [];
    if (filter === "upcoming") {
      const start = (c: ConciergeChat) => tripMap.get(c.tripId ?? "")?.startDate ?? "";
      const sorted = [...results].sort((a, b) => start(a.chat).localeCompare(start(b.chat)));
      return sorted.length ? [["By departure date", sorted] as const] : [];
    }
    const map = new Map<string, typeof results>();
    results.forEach((r) => {
      const g = groupOf(r.chat);
      map.set(g, [...(map.get(g) ?? []), r]);
    });
    return [...map.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [results, query, filter, tripMap]);

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  const NAV = [
    { to: "/discover", label: "Discover", icon: Compass, badge: "" },
    { to: "/list", label: "My list", icon: ListOrdered, badge: ranked.length ? String(ranked.length) : "" },
    { to: "/feed", label: "Feed", icon: Newspaper, badge: "" },
    { to: "/trips", label: "Trips", icon: Luggage, badge: trips.length ? String(trips.length) : "" },
    { to: "/travelers", label: "Travelers", icon: Users, badge: "" },
    { to: "/messages", label: "Messages", icon: MessagesSquare, badge: unreadTotal ? String(unreadTotal) : "", hot: unreadTotal > 0 },
    { to: "/reviews", label: "Reviews", icon: Star, badge: "" },
  ];

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 py-5">
        <Wordmark compact className="mb-3" />
        <RailButton label="New trip chat" onClick={() => go("/")} primary>
          <Plus className="size-5" />
        </RailButton>
        <RailButton label="Search chats (⌘K)" onClick={() => onToggleCollapsed?.()}>
          <Search className="size-5" />
        </RailButton>
        <div className="my-2 h-px w-8 bg-border" />
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1 py-1 scrollbar-thin">
          {chats
            .filter((c) => c.messages.length > 0)
            .map((c) => {
              const isActive = c.id === activeId && onChatRoute;
              return (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => go(`/c/${c.id}`)}
                      aria-label={c.title}
                      className={cn("press rounded-[14px] p-[2px] ring-2 transition", isActive ? "ring-primary" : "ring-transparent hover:ring-border")}
                    >
                      <CityStamp chat={c} trip={tripMap.get(c.tripId ?? "")} active={isActive} className="size-10" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{c.title}</TooltipContent>
                </Tooltip>
              );
            })}
        </div>
        <div className="my-2 h-px w-8 bg-border" />
        {NAV.map(({ to, label, icon: Icon, badge, hot }) => (
          <Tooltip key={to}>
            <TooltipTrigger asChild>
              <NavLink
                to={to}
                aria-label={label}
                className={({ isActive }) => cn("relative grid size-11 place-items-center rounded-xl transition-colors", isActive ? "bg-secondary text-secondary-foreground" : "text-foreground/75 hover:bg-muted")}
              >
                {({ isActive }) => (
                  <>
                    {isActive ? <span aria-hidden className="absolute -left-[5px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary" /> : null}
                    <Icon className="size-5" />
                    {hot && badge ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-[hsl(var(--sidebar-background))]" /> : null}
                  </>
                )}
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
        <div className="my-2 h-px w-8 bg-border" />
        <RailButton label="Expand menu" onClick={() => onToggleCollapsed?.()}>
          <ChevronsRight className="size-5" />
        </RailButton>
        <AccountMenu compact />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <Wordmark />
        <div className="flex items-center gap-0.5">
          <Notifications onNavigate={onNavigate} />
          {onToggleCollapsed ? (
            <button type="button" onClick={onToggleCollapsed} aria-label="Collapse menu" className="grid size-9 place-items-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground">
              <ChevronsLeft className="size-[18px]" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4">
        <button type="button" onClick={() => go("/")} className="press flex h-12 w-full items-center gap-2.5 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[0_8px_20px_-12px_hsl(9_63%_40%/0.8)] hover:bg-primary/90">
          <Plus className="size-[18px]" /> New trip chat
        </button>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:border-primary/60">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && results[0]) go(`/c/${results[0].chat.id}`);
            }}
            placeholder="Search chats, cities, places"
            aria-label="Search chats"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/45"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground lg:inline">⌘K</kbd>
          )}
        </label>
      </div>

      <div className="mt-4 flex items-baseline justify-between px-5">
        <h2 className="font-display text-[19px] font-semibold leading-none text-secondary">Trip chats</h2>
        <span className="text-[12px] font-medium text-muted-foreground">{counts.all ? `${counts.all} ${counts.all === 1 ? "trip" : "trips"}` : ""}</span>
      </div>
      {counts.all > 0 && !query ? (
        <div role="tablist" aria-label="Filter trip chats" className="mt-2.5 flex gap-1.5 px-4">
          {([
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["shared", "Shared"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors",
                filter === key ? "bg-secondary text-secondary-foreground" : "border border-border bg-card text-foreground/70 hover:text-foreground",
              )}
            >
              {label}
              <span className={cn("text-[11px] tabular-nums", filter === key ? "text-secondary-foreground/70" : "text-muted-foreground")}>{counts[key]}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 scrollbar-thin">
        {groups.length === 0 ? (
          <ChatsEmpty
            message={
              query
                ? `No chats match "${query}".`
                : !user
                  ? "Sign in to see your trip chats."
                  : filter === "upcoming" && counts.all
                    ? "No upcoming trips yet. Give a chat a city and dates."
                    : filter === "shared" && counts.all
                      ? "Invite someone to a trip and it'll show up here."
                      : ""
            }
            onStart={() => go("/")}
          />
        ) : (
          groups.map(([group, items]) => (
            <div key={group}>
              <p className="sticky top-0 z-10 bg-[hsl(var(--sidebar-background))]/95 px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45 backdrop-blur-sm">
                {group}
              </p>
              <ul className="space-y-1">
                {items.map(({ chat, snippet }) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    trip={tripMap.get(chat.tripId ?? "")}
                    meId={me.id}
                    active={onChatRoute && chat.id === activeId}
                    thinking={pendingChatId === chat.id}
                    snippet={snippet}
                    onOpen={() => go(`/c/${chat.id}`)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <nav aria-label="Sections" className="grid grid-cols-4 gap-1 border-t border-border/70 px-2.5 py-2.5">
        {NAV.map(({ to, label, icon: Icon, badge, hot }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "press relative flex h-[54px] flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
                isActive ? "bg-secondary text-secondary-foreground" : "text-foreground/75 hover:bg-muted hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <span aria-hidden className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" /> : null}
                <Icon className="size-[18px]" />
                <span className={cn("max-w-full truncate px-0.5", isActive && "font-semibold")}>{label}</span>
                {badge ? (
                  <span
                    className={cn(
                      "absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-bold leading-none",
                      hot ? "bg-primary text-primary-foreground" : isActive ? "bg-white/15" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
        <BetaFeedbackTile />
      </nav>

      <div className="border-t border-border/70 px-2.5 py-2">
        <AccountMenu />
      </div>
    </div>
  );
}

function RailButton({ label, onClick, children, primary }: { label: string; onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} aria-label={label} className={cn("press grid size-11 place-items-center rounded-xl", primary ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-muted")}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ChatsEmpty({ message, onStart }: { message: string; onStart: () => void }) {
  if (message) return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{message}</p>;
  return (
    <div className="mx-1.5 mt-3 rounded-xl border border-dashed border-border px-4 py-5 text-center">
      <div className="mx-auto flex w-fit -space-x-2">
        {["LIS", "TYO", "POR"].map((c, i) => (
          <span
            key={c}
            className="grid size-9 place-items-center rounded-lg font-display text-[11px] font-semibold tracking-[0.08em] text-white ring-2 ring-[hsl(var(--sidebar-background))]"
            style={{ backgroundColor: STAMP_COLORS[i], transform: `rotate(${(i - 1) * 8}deg)` }}
          >
            {c}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[14px] font-semibold">Your trips will live here</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">Each chat becomes a trip with its own itinerary.</p>
      <button type="button" onClick={onStart} className="press mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-[13px] font-semibold text-secondary-foreground">
        <Plus className="size-4" /> Plan a trip
      </button>
    </div>
  );
}

const lastLine = (chat: ConciergeChat, meId: string): string => {
  const m = chat.messages[chat.messages.length - 1];
  if (!m) return chat.subtitle;
  const who = m.role === "assistant" ? "XP" : m.authorId && m.authorId !== meId ? (m.authorName?.split(" ")[0] ?? "Someone") : "You";
  return `${who}: ${m.text.replace(/\s+/g, " ")}`;
};

const ChatRow = memo(function ChatRow({
  chat,
  trip,
  meId,
  active,
  thinking,
  snippet,
  onOpen,
}: {
  chat: ConciergeChat;
  trip?: Trip;
  meId: string;
  active: boolean;
  thinking: boolean;
  snippet?: string;
  onOpen: () => void;
}) {
  const { renameChat, togglePin, deleteChat } = useConcierge();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(chat.title);
  const stops = trip ? trip.days.reduce((n, d) => n + d.items.length, 0) : 0;
  const plannedDays = trip ? trip.days.filter((d) => d.items.length > 0).length : 0;
  const fresh = useMemo(() => (trip ? freshItemIds(trip, chat.seenAt, meId).size : 0), [trip, chat.seenAt, meId]);
  const when = trip ? countdown(trip) : undefined;

  const commit = () => {
    renameChat(chat.id, draft);
    setEditing(false);
  };

  const preview = thinking ? "Planning…" : (snippet ?? lastLine(chat, meId));

  return (
    <li className="group relative">
      {editing ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted p-2">
          <CityStamp chat={chat} trip={trip} className="size-11" />
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
            className="h-9 min-w-0 flex-1 rounded-md border border-primary/60 bg-card px-2 text-sm outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex w-full items-start gap-3 rounded-xl p-2.5 pr-3 text-left transition-colors",
            active ? "bg-card shadow-[0_1px_0_hsl(39_28%_80%/0.7),0_10px_24px_-16px_hsl(222_37%_19%/0.4)]" : "hover:bg-muted/70",
          )}
        >
          {active ? <span className="absolute -left-2.5 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" /> : null}
          <span className="relative">
            <CityStamp chat={chat} trip={trip} active={active} className="size-11" />
            {thinking ? (
              <span className="absolute -right-1 -top-1 size-3 animate-pulse rounded-full bg-primary ring-2 ring-[hsl(var(--sidebar-background))]" />
            ) : fresh > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-[hsl(var(--sidebar-background))]">
                {fresh}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              {chat.pinned ? <Pin className="size-3 shrink-0 self-center fill-current text-primary" /> : null}
              <span className={cn("truncate text-[14.5px] leading-tight", active ? "font-semibold" : "font-medium")}>{chat.title}</span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">{relTime(chat.updatedAt)}</span>
            </span>
            {trip && when ? (
              <span className="mt-1 flex items-center gap-1.5 text-[12px] text-foreground/65">
                <span className="tabular-nums">{shortDates(trip.startDate, trip.endDate)}</span>
                <span className="text-foreground/30">·</span>
                <span
                  className={cn(
                    "font-semibold",
                    when.tone === "now" ? "text-[#3F8A63]" : when.tone === "soon" ? "text-primary" : when.tone === "past" ? "text-muted-foreground" : "text-secondary",
                  )}
                >
                  {when.label}
                </span>
                {chat.roomId ? <Users className="ml-auto size-3.5 shrink-0 text-secondary/70" aria-label="Shared trip" /> : null}
              </span>
            ) : null}
            <span className={cn("mt-0.5 block truncate text-[12.5px]", thinking ? "font-medium text-primary" : "text-muted-foreground")}>{preview}</span>
            {trip && trip.days.length > 0 ? (
              <span className="mt-1.5 flex items-center gap-2" title={`${plannedDays} of ${trip.days.length} days planned`}>
                <span className="flex flex-1 gap-[3px]">
                  {trip.days.slice(0, 14).map((d, i) => (
                    <span key={i} className={cn("h-1 flex-1 rounded-full", d.items.length > 0 ? "bg-primary" : "bg-border")} />
                  ))}
                </span>
                <span className="shrink-0 text-[10.5px] font-medium tabular-nums text-muted-foreground">
                  {stops} {stops === 1 ? "stop" : "stops"}
                </span>
              </span>
            ) : null}
          </span>
        </button>
      )}
      {!editing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options for ${chat.title}`}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 rounded-xl">
            <DropdownMenuItem
              onSelect={() => {
                setDraft(chat.title);
                window.setTimeout(() => setEditing(true), 0);
              }}
            >
              <Pencil className="mr-2 size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => togglePin(chat.id)}>
              {chat.pinned ? <PinOff className="mr-2 size-4" /> : <Pin className="mr-2 size-4" />} {chat.pinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            {trip ? (
              <DropdownMenuItem onSelect={() => navigate(`/trips/${trip.id}`)}>
                <Luggage className="mr-2 size-4" /> Open itinerary
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                deleteChat(chat.id);
                if (active) navigate("/");
                toast(`Deleted "${chat.title}"`, { description: trip ? "Its itinerary is still in Trips." : undefined });
              }}
            >
              <Trash2 className="mr-2 size-4" /> Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
});

function SyncLine() {
  const { user } = useAuth();
  const { status } = useSync();
  if (!user) return null;
  const label = status === "syncing" ? "Syncing…" : status === "offline" ? "Offline, will retry" : "Synced";
  return (
    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
      {status === "offline" ? <CloudOff className="size-3" /> : status === "syncing" ? <Loader2 className="size-3 animate-spin" /> : <Cloud className="size-3 text-[#3F8A63]" />}
      {label}
    </span>
  );
}

/** Always-visible way for beta testers to reach the team. */
function BetaFeedbackTile() {
  const { openFeedback } = useFeedback();
  return (
    <button
      type="button"
      onClick={() => openFeedback("bug")}
      className="press relative flex h-[54px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/45 text-[11px] font-semibold text-primary hover:bg-accent/60"
    >
      <MessageSquareHeart className="size-[18px]" />
      Feedback
      <span className="absolute -top-1.5 right-1 rounded-full bg-primary px-1 text-[8.5px] font-bold uppercase tracking-wider text-primary-foreground">Beta</span>
    </button>
  );
}

function AccountMenu({ compact }: { compact?: boolean }) {
  const { profile, resetAll } = useProfile();
  const { user, signIn, isConfigured } = useAuth();
  const { syncNow, signOutAndClear } = useSync();
  const { openFeedback } = useFeedback();
  const [deleting, setDeleting] = useState<boolean>(false);
  const navigate = useNavigate();
  return (
    <>
    <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className={cn("flex items-center gap-3 rounded-xl text-left hover:bg-muted", compact ? "p-1" : "w-full p-2")}>
          <PersonAvatar name={user?.name ?? profile.name} src={user?.picture} className="size-10 text-lg" />
          {compact ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{profile.name}</span>
              {user ? <SyncLine /> : <span className="block truncate text-xs text-muted-foreground">{blendLabel(profile.blend)} blend</span>}
            </span>
          )}
          {compact ? null : <MoreHorizontal className="size-4 text-muted-foreground" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60 rounded-xl">
        <DropdownMenuLabel className="font-normal">
          <p className="font-display text-lg leading-tight">{profile.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email || `${blendLabel(profile.blend)} blend`}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem onSelect={() => void syncNow()}>
            <Cloud className="mr-2 size-4" /> Sync now
          </DropdownMenuItem>
        ) : isConfigured ? (
          <DropdownMenuItem onSelect={() => void signIn("google")}>
            <Cloud className="mr-2 size-4" /> Sign in
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => navigate("/travelers")}>
          <UserRound className="mr-2 size-4" /> Your Taste Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/welcome")}>
          <RotateCcw className="mr-2 size-4" /> Rebuild Taste Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openFeedback("bug")}>
          <MessageSquareHeart className="mr-2 size-4" /> Send feedback
        </DropdownMenuItem>
        {user ? (
          <DropdownMenuItem onSelect={() => navigate("/beta")}>
            <ShieldCheck className="mr-2 size-4" /> Beta dashboard
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => navigate("/privacy")}>
          <FileText className="mr-2 size-4" /> Privacy & terms
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem onSelect={() => void signOutAndClear()}>
            <LogOut className="mr-2 size-4" /> Sign out
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            if (window.confirm("Clear everything saved in this browser? Your account data (if signed in) is kept.")) resetAll();
          }}
        >
          <RotateCcw className="mr-2 size-4" /> Reset this device
        </DropdownMenuItem>
        {user ? (
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 size-4" /> Delete account
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">XP Match beta · v{APP_VERSION}</p>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

/** Taste overlaps: matched travelers who saved places that are on your trips. */
export function Notifications({ onNavigate }: { onNavigate?: () => void }) {
  const { travelerMatches } = useSocial();
  const { myPlaceIds } = useTrips();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const out: { id: string; name: string; avatar: string; text: string; place: string; to: string }[] = [];
    travelerMatches.slice(0, 4).forEach(({ traveler, score }) => {
      const overlap = traveler.savedPlaceIds.find((id) => myPlaceIds.has(id));
      if (overlap && PLACE_BY_ID[overlap]) {
        out.push({
          id: `${traveler.id}-${overlap}`,
          name: traveler.name,
          avatar: traveler.avatar,
          text: `${traveler.name.split(" ")[0]} (${score}% match) also saved`,
          place: PLACE_BY_ID[overlap].name,
          to: `/travelers/${encodeURIComponent(traveler.id)}`,
        });
      }
    });
    return out;
  }, [travelerMatches, myPlaceIds]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="relative grid size-9 place-items-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground" aria-label={`Notifications, ${items.length} new`}>
          <Bell className="size-[18px]" />
          {items.length > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-[hsl(var(--sidebar-background))]" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-xl p-2">
        <p className="eyebrow px-2 pb-2 pt-1">Taste overlaps</p>
        {items.length === 0 ? (
          <p className="px-2 pb-3 text-sm text-muted-foreground">Save a few places and we'll tell you when matched travelers love them too.</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                navigate(n.to);
                onNavigate?.();
              }}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"
            >
              <PersonAvatar name={n.name} src={n.avatar} className="size-9" />
              <span className="text-sm leading-snug">
                <span className="text-primary">{n.text}</span> <span className="font-semibold">{n.place}</span>
              </span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
