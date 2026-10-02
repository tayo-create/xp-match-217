import { Check, Crown, Loader2, LogOut, UserMinus, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { DEFAULT_SETTINGS, INTERESTS, PACES, applyTripSettings } from "@/data/interests";
import { useCityPlaces } from "@/hooks/use-city-places";
import { rankPlaces } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { ConciergeChat, InterestId, TripPace, TripSettings } from "@/lib/types";
import { type RoomMember, useCollab } from "@/providers/CollabProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

interface Props {
  chat: ConciergeChat;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Per-trip focus: interests, pace and notes that steer every future pick in this chat. */
export function TripSettingsDialog({ chat, open, onOpenChange }: Props) {
  const { setSettings } = useConcierge();
  const { profile } = useProfile();
  const { tripById } = useTrips();
  const trip = tripById(chat.tripId);
  const [draft, setDraft] = useState<TripSettings>(chat.settings ?? DEFAULT_SETTINGS);

  useEffect(() => {
    if (open) setDraft(chat.settings ?? DEFAULT_SETTINGS);
  }, [open, chat.settings]);

  const toggle = (id: InterestId) =>
    setDraft((d) => ({ ...d, interests: d.interests.includes(id) ? d.interests.filter((x) => x !== id) : [...d.interests, id].slice(-4) }));

  const city = trip?.city ?? "Lisbon";
  const { places: cityPlaces } = useCityPlaces(open ? city : undefined);
  const preview = useMemo(() => rankPlaces(applyTripSettings(profile, draft), cityPlaces).slice(0, 3), [profile, draft, cityPlaces]);

  const save = () => {
    setSettings(chat.id, draft);
    onOpenChange(false);
    toast.success("Trip focus saved", { description: draft.interests.length ? "Future picks in this chat will lean into it." : "Back to your Taste Profile alone." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-[620px]">
        <DialogHeader>
          <p className="eyebrow">Trip settings</p>
          <DialogTitle className="font-display text-[34px] font-semibold leading-tight text-secondary">What's this trip about?</DialogTitle>
          <DialogDescription className="text-[15px]">Pick up to 4. They layer on top of your Taste Profile for this trip only.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {INTERESTS.map(({ id, label, blurb, icon: Icon }) => {
            const on = draft.interests.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                className={cn(
                  "press relative flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                  on ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card hover:border-primary/50",
                )}
              >
                <Icon className={cn("size-5", on ? "text-primary-foreground" : "text-primary")} />
                <span className="mt-2.5 text-[15px] font-semibold">{label}</span>
                <span className={cn("mt-0.5 text-xs leading-snug", on ? "text-secondary-foreground/70" : "text-muted-foreground")}>{blurb}</span>
                {on ? (
                  <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary">
                    <Check className="size-3 text-primary-foreground" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div>
          <p className="text-sm font-semibold">Pace</p>
          <div role="radiogroup" aria-label="Pace" className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {PACES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={draft.pace === p.id}
                onClick={() => setDraft((d) => ({ ...d, pace: p.id as TripPace }))}
                className={cn("rounded-lg px-2 py-2 text-center transition-colors", draft.pace === p.id ? "bg-card shadow-sm" : "hover:bg-card/50")}
              >
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-[11.5px] text-muted-foreground">{p.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold">Anything else XP should know?</span>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value.slice(0, 400) }))}
            rows={2}
            placeholder="e.g. Traveling with my mom, no steep hills. Anniversary dinner on day 3."
            className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary"
          />
        </label>

        <div className="rounded-xl border border-dashed border-primary/40 bg-accent/50 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Top {city} picks with this focus</p>
          <ul className="mt-2 space-y-1.5">
            {preview.map(({ place, match }) => (
              <li key={place.id} className="flex items-center gap-2 text-sm">
                <span className="match-pill px-2 py-0.5 text-[11px]">{match.score}%</span>
                <span className="truncate font-medium">{place.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{place.neighborhood}</span>
              </li>
            ))}
          </ul>
        </div>

        {chat.roomId ? <MembersPanel chat={chat} onLeft={() => onOpenChange(false)} /> : null}

        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(DEFAULT_SETTINGS)} className="h-12 rounded-xl px-4 text-sm font-medium text-foreground/70 hover:bg-muted">
            Clear
          </button>
          <button type="button" onClick={save} className="press h-12 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            Save trip focus
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Who's on this shared trip. The owner can remove people (they can't rejoin unless allowed back). */
function MembersPanel({ chat, onLeft }: { chat: ConciergeChat; onLeft: () => void }) {
  const { metaFor, onlineFor, isOwner, removeMember, allowBack, leaveTrip, myId } = useCollab();
  const roomId = chat.roomId ?? "";
  const meta = metaFor(roomId);
  const online = new Set(onlineFor(roomId));
  const owner = isOwner(roomId);
  const [confirm, setConfirm] = useState<RoomMember | null>(null);
  const [leaving, setLeaving] = useState<boolean>(false);
  const [busy, setBusy] = useState<string>("");

  if (!meta) return <p className="text-sm text-muted-foreground">Loading members…</p>;

  const remove = async (m: RoomMember) => {
    setBusy(m.userId);
    try {
      await removeMember(roomId, m.userId);
      toast(`${m.name} was removed`, { description: "They lost access and can't rejoin with the invite link." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove them.");
    } finally {
      setBusy("");
      setConfirm(null);
    }
  };

  const undo = async (userId: string, name: string) => {
    setBusy(userId);
    try {
      await allowBack(roomId, userId);
      toast.success(`${name} can join again with the invite link`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="rounded-xl border border-border p-3.5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Members · {meta.members.length}</p>
        <p className="text-xs text-muted-foreground">{owner ? "You own this trip" : "Only the owner can remove people"}</p>
      </div>
      <ul className="mt-2 space-y-1">
        {meta.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-muted/50">
            <PersonAvatar name={m.name} src={m.avatar} online={online.has(m.userId)} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{m.name}</span>
                {m.userId === myId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                {m.role === "owner" ? <Crown className="size-3.5 text-[#D9A43A]" aria-label="Owner" /> : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                {m.role === "owner" ? "Owner" : "Can edit"} · joined {new Date(m.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {m.via === "share" ? " from public link" : ""}
              </span>
            </span>
            {busy === m.userId ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : owner && m.role !== "owner" ? (
              <button type="button" onClick={() => setConfirm(m)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-destructive hover:bg-destructive/10">
                <UserMinus className="size-4" /> Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {owner && meta.removed.length ? (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Removed</p>
          <ul className="mt-1.5 space-y-1">
            {meta.removed.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 px-1.5 py-1 opacity-70">
                <PersonAvatar name={r.name} src={r.avatar} className="size-7 grayscale" />
                <span className="flex-1 truncate text-sm line-through">{r.name}</span>
                <button type="button" onClick={() => void undo(r.userId, r.name)} disabled={busy === r.userId} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-muted">
                  <Undo2 className="size-3.5" /> Allow back
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!owner ? (
        <button
          type="button"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            await leaveTrip(chat.id, roomId);
            setLeaving(false);
            toast("You left this trip", { description: "Your copy stays on this device." });
            onLeft();
          }}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline disabled:opacity-60"
        >
          <LogOut className="size-4" /> Leave trip
        </button>
      ) : null}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-secondary">Remove {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They'll be disconnected right away and won't see new changes. Their invite link stops working for them. You can allow them back later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void remove(confirm)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
