import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Loader2, MapPinned, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { Wordmark } from "@/components/xp/Sidebar";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { publicProfile } from "@/lib/sharedProfile";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { type RoomDoc, useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { formatRange } from "@/providers/TripsProvider";

interface Preview {
  preview: { title: string; city: string; country: string; startDate: string; endDate: string; cover: string; days: number; stops: number };
  owner: { name: string; avatar: string } | null;
  members: { name: string; avatar: string }[];
  online: number;
  you: "guest" | "member" | "removed" | "none";
}

/** Invite landing at /join/:roomId: preview the trip, sign in, then join the live planning chat. */
export default function JoinTrip() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { chats, joinRoom } = useConcierge();
  const { profile } = useProfile();
  const { user, isLoading: authLoading } = useAuth();
  const existing = chats.find((c) => c.roomId === roomId);

  useEffect(() => {
    if (existing && user) navigate(`/c/${existing.id}`, { replace: true });
  }, [existing, user, navigate]);

  const query = useQuery({
    queryKey: ["room-preview", roomId, user?.id],
    queryFn: async () => readJson<Preview>(await fetchWithAuth(`${BACKEND_PATH}/room/${roomId ?? ""}`)),
    enabled: Boolean(roomId) && !authLoading,
    retry: 1,
  });

  const join = useMutation({
    mutationFn: async () =>
      readJson<{ doc: RoomDoc }>(
        await fetchWithAuth(`${BACKEND_PATH}/room/${roomId ?? ""}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: profile.name, avatar: user?.picture ?? "", profile: publicProfile(profile) }),
        }),
      ),
    onSuccess: ({ doc }) => {
      if (!roomId) return;
      const chatId = joinRoom(roomId, doc);
      if (chatId) navigate(`/c/${chatId}`, { replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't join this trip."),
  });

  const data = query.data;
  const p = data?.preview;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-4 pb-16 sm:px-8">
        {query.isLoading || authLoading ? (
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading invite" />
        ) : query.isError || !p ? (
          <div className="max-w-md text-center">
            <MapPinned className="mx-auto size-10 text-muted-foreground" />
            <h1 className="mt-4 text-4xl font-semibold text-secondary">Invite not found</h1>
            <p className="mt-2 text-muted-foreground">{query.error instanceof Error ? query.error.message : "Ask for a fresh invite link."}</p>
            <Link to="/" className="press mt-6 inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
              Go to XP Match
            </Link>
          </div>
        ) : (
          <div className="surface grid w-full overflow-hidden animate-rise md:grid-cols-[1.1fr_1fr]">
            <div className="relative min-h-[260px]">
              {p.cover ? <img src={p.cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-secondary" />}
              <div className="absolute inset-0 bg-gradient-to-t from-secondary/85 to-transparent" />
              <div className="absolute bottom-0 p-6 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">You're invited</p>
                <h1 className="text-[52px] font-semibold leading-none">{p.city}</h1>
                {p.startDate ? <p className="mt-2 text-white/85">{formatRange(p.startDate, p.endDate)}</p> : null}
              </div>
            </div>
            <div className="flex flex-col p-6 sm:p-8">
              <h2 className="text-[30px] font-semibold leading-tight text-secondary">{data.owner ? `Plan ${p.city} with ${data.owner.name}` : `Plan ${p.city} together`}</h2>
              <p className="mt-2 text-foreground/75">
                {p.days} days · {p.stops} stops so far. Join to see every change live, chat with the group, and get picks scored for all of you.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {data.members.slice(0, 5).map((m, i) => (
                    <PersonAvatar key={`${m.name}-${i}`} name={m.name} src={m.avatar} className="size-9 rounded-full ring-2 ring-card" />
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="size-4" /> {data.members.length} {data.members.length === 1 ? "member" : "members"}
                  {data.online ? ` · ${data.online} online` : ""}
                </span>
              </div>

              <div className="mt-auto pt-6">
                {data.you === "removed" ? (
                  <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-4 text-destructive">
                    <Ban className="mt-0.5 size-5 shrink-0" />
                    <p className="text-sm">The trip owner removed you from this trip. Ask them to let you back in.</p>
                  </div>
                ) : !user ? (
                  <SignInPrompt className="border-0 p-0 shadow-none" title="Sign in to join" body="Trips are only shared with signed-in travelers, so the owner always knows who's planning." />
                ) : (
                  <>
                    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                      <PersonAvatar name={profile.name} src={user.picture} className="size-10" />
                      <p className="text-sm">
                        Joining as <span className="font-semibold">{profile.name}</span>
                        {user.email ? <span className="text-muted-foreground"> · {user.email}</span> : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => join.mutate()}
                      disabled={join.isPending}
                      className="press mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[17px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {join.isPending ? <Loader2 className="size-5 animate-spin" /> : null} Join trip
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
