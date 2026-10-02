import { Check, Copy, Eye, Globe, Link2, Loader2, PencilLine, UserCheck, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { cn } from "@/lib/utils";
import type { ConciergeChat, Trip } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCollab } from "@/providers/CollabProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { type AccessRequest, useShares } from "@/providers/SharesProvider";

interface Props {
  trip: Trip;
  /** When given, the dialog also offers a live collaboration invite for this chat. */
  chat?: ConciergeChat;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: "invite" | "public";
}

const copy = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

function CopyRow({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState<boolean>(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-1.5 pl-3">
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      <button
        type="button"
        onClick={async () => {
          if (await copy(value)) {
            setDone(true);
            window.setTimeout(() => setDone(false), 1800);
          } else toast.error("Couldn't copy. Select the link and copy it manually.");
        }}
        className="press inline-flex h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-semibold text-secondary-foreground"
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />} {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Invite signed-in collaborators to plan live, or publish a view-only public link with per-person edit grants. */
export function ShareDialog({ trip, chat, open, onOpenChange, defaultTab = "invite" }: Props) {
  const [tab, setTab] = useState<"invite" | "public">(chat ? defaultTab : "public");
  const { user } = useAuth();
  const { startRoom, newChat } = useConcierge();
  const { metaFor, onlineFor, ensureRoom, addMember, removeMember, isOwner } = useCollab();
  const { shareFor, shareUrl, enableShare, disableShare, manageAccess, pendingFor } = useShares();
  const [busy, setBusy] = useState<boolean>(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [acting, setActing] = useState<string>("");
  const share = shareFor(trip.id);
  const roomId = chat?.roomId;
  const meta = metaFor(roomId);
  const online = new Set(onlineFor(roomId));
  const inviteUrl = roomId ? `${window.location.origin}/join/${roomId}` : "";
  const owner = !roomId || isOwner(roomId);
  const pending = pendingFor(trip.id);

  const loadRequests = useCallback(async () => {
    if (!share) return;
    try {
      setRequests(await manageAccess(trip.id, "list"));
    } catch (e) {
      console.warn("[share] list requests failed", e instanceof Error ? e.message : e);
    }
  }, [share, manageAccess, trip.id]);

  useEffect(() => {
    if (open && tab === "public") void loadRequests();
  }, [open, tab, loadRequests]);

  useEffect(() => {
    if (open && pending) setTab("public");
  }, [open, pending]);

  const createInvite = async () => {
    if (!chat) return;
    setBusy(true);
    try {
      const id = startRoom(chat.id);
      await ensureRoom(id);
      toast.success("Invite link ready", { description: "Only people who sign in can join, and you can remove anyone." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the invite.");
    } finally {
      setBusy(false);
    }
  };

  const togglePublic = async () => {
    setBusy(true);
    try {
      if (share) {
        await disableShare(trip.id);
        setRequests([]);
        toast("Public link turned off");
      } else {
        await enableShare(trip.id);
        toast.success("Public link is live", { description: "Anyone with the link can view. Nobody can edit unless you allow it." });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the link");
    } finally {
      setBusy(false);
    }
  };

  /** Granting edit access adds the person to this trip's live room. */
  const grant = async (r: AccessRequest) => {
    setActing(r.userId);
    try {
      let id = chat?.roomId;
      if (!id) {
        const chatId = chat?.id ?? newChat({ tripId: trip.id });
        id = startRoom(chatId);
      }
      await ensureRoom(id);
      await addMember(id, { userId: r.userId, name: r.name, avatar: r.avatar });
      setRequests(await manageAccess(trip.id, "grant", r.userId, id));
      toast.success(`${r.name} can now edit`, { description: "They'll see an Open trip button on the shared link." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't grant access.");
    } finally {
      setActing("");
    }
  };

  const decline = async (r: AccessRequest, op: "deny" | "revoke") => {
    setActing(r.userId);
    try {
      if (op === "revoke" && r.roomId) await removeMember(r.roomId, r.userId).catch(() => undefined);
      setRequests(await manageAccess(trip.id, op, r.userId));
      toast(op === "revoke" ? `${r.name} is back to view-only` : `Declined ${r.name}'s request`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update access.");
    } finally {
      setActing("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[32px] font-semibold leading-tight text-secondary">Share {trip.city}</DialogTitle>
          <DialogDescription>Plan together with people you invite, or send a view-only link.</DialogDescription>
        </DialogHeader>

        {chat ? (
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(
              [
                ["invite", "Plan together", Users],
                ["public", "Public link", Globe],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn("relative inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold", tab === id ? "bg-card shadow-sm" : "text-foreground/70")}
              >
                <Icon className="size-4" /> {label}
                {id === "public" && pending ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">{pending}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "invite" && chat ? (
          !user ? (
            <SignInPrompt className="border-0 p-2 shadow-none" title="Sign in to invite people" body="Shared trips are only for signed-in travelers, so you always know who's planning with you." />
          ) : (
            <div className="space-y-4">
              {roomId ? (
                <>
                  <p className="text-[15px] text-foreground/80">People must sign in to join. They can add stops, chat with the group and ask XP. {owner ? "You can remove anyone in Trip settings." : ""}</p>
                  <CopyRow value={inviteUrl} label="Invite link" />
                  <div>
                    <p className="text-sm font-semibold">Members · {meta?.members.length ?? 1}</p>
                    <ul className="mt-2 space-y-1.5">
                      {(meta?.members ?? []).map((m) => (
                        <li key={m.userId} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                          <PersonAvatar name={m.name} src={m.avatar} online={online.has(m.userId)} className="size-8" />
                          <span className="text-sm font-medium">{m.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{m.role === "owner" ? "Owner" : "Can edit"}</span>
                        </li>
                      ))}
                      {(meta?.members.length ?? 0) <= 1 ? <li className="px-1 text-sm text-muted-foreground">Send the link. People appear here once they sign in and join.</li> : null}
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[15px] text-foreground/80">Turn this chat into a shared trip. Everyone sees new stops, messages and the trip focus the moment they change, and every pick is scored for the whole group.</p>
                  <button type="button" onClick={createInvite} disabled={busy} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Create invite link
                  </button>
                </>
              )}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border p-3.5">
              <Eye className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-semibold">Read-only public link</p>
                <p className="text-sm text-muted-foreground">Anyone with it can view, no account needed. Nobody can change anything unless you approve them below. Chat stays private.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(share)}
                aria-label="Public link"
                disabled={busy}
                onClick={togglePublic}
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60", share ? "bg-primary" : "bg-input")}
              >
                {busy ? <Loader2 className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" /> : <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", share ? "left-6" : "left-1")} />}
              </button>
            </div>
            {share ? (
              <>
                <CopyRow value={shareUrl(share)} label="Public link" />
                <div>
                  <div className="flex items-center gap-2">
                    <PencilLine className="size-4 text-primary" />
                    <p className="text-sm font-semibold">Edit access</p>
                  </div>
                  {requests.length === 0 ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">Viewers can ask to edit after signing in. Requests show up here for you to approve.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {requests.map((r) => (
                        <li key={r.userId} className={cn("flex items-center gap-3 rounded-lg px-3 py-2", r.status === "pending" ? "bg-accent" : "bg-muted/50")}>
                          <PersonAvatar name={r.name} src={r.avatar} className="size-9" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{r.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.status === "pending" ? (r.note ? `"${r.note}"` : "Wants to edit") : r.status === "granted" ? "Can edit" : "View only"}</span>
                          </span>
                          {acting === r.userId ? (
                            <Loader2 className="size-4 animate-spin text-primary" />
                          ) : r.status === "pending" ? (
                            <span className="flex gap-1">
                              <button type="button" onClick={() => void decline(r, "deny")} aria-label={`Decline ${r.name}`} className="grid size-9 place-items-center rounded-lg hover:bg-background">
                                <X className="size-4" />
                              </button>
                              <button type="button" onClick={() => void grant(r)} className="press inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
                                <UserCheck className="size-4" /> Allow
                              </button>
                            </span>
                          ) : r.status === "granted" ? (
                            <button type="button" onClick={() => void decline(r, "revoke")} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-background">
                              Revoke
                            </button>
                          ) : (
                            <button type="button" onClick={() => void grant(r)} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary hover:bg-background">
                              Allow
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
