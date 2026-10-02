import { Crown, LogIn } from "lucide-react";
import { memo } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { blendLabel } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { ConciergeChat } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCollab } from "@/providers/CollabProvider";

/** Avatar stack of everyone on a shared trip (online ones get a green dot), with a full list on click. */
export const TripMembers = memo(function TripMembers({ chat, onManage }: { chat: ConciergeChat; onManage?: () => void }) {
  const { metaFor, onlineFor, statusFor, isOwner, myId } = useCollab();
  const { signIn } = useAuth();
  if (!chat.roomId) return null;
  const status = statusFor(chat.roomId);

  if (status === "signin") {
    return (
      <button type="button" onClick={() => void signIn("google")} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-accent">
        <LogIn className="size-3.5" /> Sign in to sync this shared trip
      </button>
    );
  }

  const meta = metaFor(chat.roomId);
  const online = new Set(onlineFor(chat.roomId));
  const members = meta?.members ?? [];
  const live = status === "live";
  const onlineOthers = members.filter((m) => m.userId !== myId && online.has(m.userId)).length;
  const owner = isOwner(chat.roomId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-muted" aria-label={`${members.length} trip members. Show list`}>
          <span className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <PersonAvatar key={m.userId} name={m.name} src={m.avatar} online={online.has(m.userId)} className="size-8 rounded-full ring-2 ring-background text-sm" />
            ))}
            {members.length > 4 ? <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-bold ring-2 ring-background">+{members.length - 4}</span> : null}
          </span>
          <span className={cn("hidden text-xs font-semibold sm:inline", live ? "text-[#3F8A63]" : "text-muted-foreground")}>
            {!live ? (status === "connecting" ? "Connecting…" : "Reconnecting") : onlineOthers ? `${onlineOthers} here now` : `${members.length} members`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-xl p-2">
        <p className="eyebrow px-2 pb-1.5 pt-1">On this trip</p>
        <ul className="space-y-0.5">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <PersonAvatar name={m.name} src={m.avatar} online={online.has(m.userId)} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{m.name}</span>
                  {m.userId === myId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.role === "owner" ? "Owner" : "Can edit"}
                  {m.profile ? ` · ${blendLabel(m.profile.blend)}` : ""}
                  {online.has(m.userId) ? " · online" : ""}
                </span>
              </span>
              {m.role === "owner" ? <Crown className="size-4 text-[#D9A43A]" aria-label="Owner" /> : null}
            </li>
          ))}
        </ul>
        {onManage ? (
          <button type="button" onClick={onManage} className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-muted">
            {owner ? "Manage members" : "Trip settings"}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
});
