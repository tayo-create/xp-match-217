import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bus, Clock, CopyPlus, Download, Eye, Footprints, Loader2, MapPinned, PencilLine } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Wordmark } from "@/components/xp/Sidebar";
import { TripMap, dayColor, type MapStop } from "@/components/xp/TripMap";
import { KIND_LABEL, placeImage } from "@/data/places";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useViewingDay } from "@/hooks/use-viewing-day";
import { legId, pairsFor, useLegs } from "@/lib/routing";
import { uid } from "@/lib/persist";
import { cn } from "@/lib/utils";
import type { Trip } from "@/lib/types";
import { chronological, dayDate, formatRange, useTrips } from "@/providers/TripsProvider";

interface SharedPayload {
  trip: Trip;
  owner: string;
  publishedAt: number;
  mode: "view";
  you: { status: "guest" | "none" | "pending" | "granted" | "denied"; roomId?: string };
}

/** Public, read-only itinerary at /s/:id. Works without an account. */
export default function SharedTrip() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { upsertTrip } = useTrips();
  const { user, signIn, isSigningIn } = useAuth();
  const { profile } = useProfile();
  const { chats } = useConcierge();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<number>(-1);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState<boolean>(false);

  const query = useQuery({
    queryKey: ["shared-trip", id, user?.id ?? "guest"],
    queryFn: async () => readJson<SharedPayload>(await fetchWithAuth(`${BACKEND_PATH}/share/${id ?? ""}`)),
    enabled: Boolean(id),
    retry: 1,
    refetchInterval: 30_000,
  });

  const requestEdit = useMutation({
    mutationFn: async () =>
      readJson<{ status: string }>(
        await fetchWithAuth(`${BACKEND_PATH}/share/${id ?? ""}/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: profile.name, avatar: user?.picture ?? "" }),
        }),
      ),
    onSuccess: () => {
      toast.success("Request sent", { description: `${query.data?.owner ?? "The owner"} will see it and can let you edit.` });
      void queryClient.invalidateQueries({ queryKey: ["shared-trip", id, user?.id ?? "guest"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send the request."),
  });

  const you = query.data?.you;
  const grantedRoom = you?.status === "granted" ? you.roomId : undefined;
  const joinedChat = grantedRoom ? chats.find((c) => c.roomId === grantedRoom) : undefined;

  const trip = query.data?.trip;
  const stops = useMemo<MapStop[]>(() => (trip ? chronological(trip).map(({ item, day }) => ({ id: item.id, place: item.place, time: item.time, day })) : []), [trip]);
  const mapStops = useMemo(() => (scope < 0 ? stops : stops.filter((s) => s.day === scope)), [stops, scope]);
  const numberOf = useMemo(() => Object.fromEntries(stops.map((s, i) => [s.id, i + 1])) as Record<string, number>, [stops]);
  const pairs = useMemo(() => pairsFor(trip?.days.map((d) => d.items) ?? []), [trip]);
  const legs = useLegs(pairs);
  // On "Whole trip", the map follows the day being read as the page scrolls.
  const daysRef = useRef<HTMLDivElement>(null);
  const viewingDay = useViewingDay({ container: daysRef, enabled: scope < 0 && (trip?.days.length ?? 0) > 1, layoutKey: `${stops.length}` });
  const focusDay = scope < 0 && viewingDay !== undefined && stops.some((s) => s.day === viewingDay) ? viewingDay : undefined;

  const copyToMine = () => {
    if (!trip) return;
    const copy: Trip = {
      ...trip,
      id: uid("trip"),
      days: trip.days.map((d) => ({ items: d.items.map((x) => ({ ...x, id: uid("it"), addedAt: undefined, addedBy: undefined, addedById: undefined })) })),
    };
    upsertTrip(copy);
    toast.success(`${trip.city} copied to your trips`);
    navigate(`/trips/${copy.id}`);
  };

  const exportPdf = async () => {
    if (!trip) return;
    setExporting(true);
    try {
      const { downloadTripPdf } = await import("@/lib/pdf");
      await downloadTripPdf(trip, { owner: query.data?.owner });
    } catch (e) {
      console.warn("[pdf] export failed", e instanceof Error ? e.message : e);
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-8">
          <Wordmark />
          <span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline">Shared itinerary</span>
          <Link to="/" className="press ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Plan your own <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      {query.isLoading ? (
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading itinerary" />
        </div>
      ) : query.isError || !trip ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <MapPinned className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-4xl font-semibold text-secondary">Itinerary not found</h1>
          <p className="mt-2 text-muted-foreground">{query.error instanceof Error ? query.error.message : "This link may have been turned off by its owner."}</p>
          <Link to="/" className="press mt-6 inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
            Start planning on XP Match
          </Link>
        </div>
      ) : (
        <main className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-8">
          <section className="relative mt-6 overflow-hidden rounded-2xl animate-rise">
            <img src={trip.cover} alt="" className="h-[240px] w-full object-cover sm:h-[300px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-secondary/90 via-secondary/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-6 text-white sm:p-8">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Planned by {query.data?.owner} with XP Match</p>
                <h1 className="mt-1 text-[48px] font-semibold leading-none sm:text-[64px]">{trip.city}</h1>
                <p className="mt-2 text-white/85">
                  {formatRange(trip.startDate, trip.endDate)} · {trip.days.length} days · {stops.length} stops
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportPdf} disabled={exporting} className="press inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold backdrop-blur hover:bg-white/25 disabled:opacity-60">
                  {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF
                </button>
                <button type="button" onClick={copyToMine} className="press inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-secondary hover:bg-white/90">
                  <CopyPlus className="size-4" /> Copy to my trips
                </button>
              </div>
            </div>
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            {grantedRoom ? <PencilLine className="size-5 shrink-0 text-primary" /> : you?.status === "pending" ? <Clock className="size-5 shrink-0 text-[#B7791F]" /> : <Eye className="size-5 shrink-0 text-muted-foreground" />}
            <p className="min-w-0 flex-1 text-[14.5px]">
              {grantedRoom ? (
                <>
                  <span className="font-semibold">You can edit this trip.</span> <span className="text-muted-foreground">{query.data?.owner} gave you access.</span>
                </>
              ) : you?.status === "pending" ? (
                <>
                  <span className="font-semibold">Request sent.</span> <span className="text-muted-foreground">You'll be able to edit once {query.data?.owner} approves.</span>
                </>
              ) : you?.status === "denied" ? (
                <>
                  <span className="font-semibold">View only.</span> <span className="text-muted-foreground">The owner kept this itinerary read-only for you.</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">View only.</span> <span className="text-muted-foreground">Nobody can change this itinerary unless the owner allows it.</span>
                </>
              )}
            </p>
            {grantedRoom ? (
              <Link to={joinedChat ? `/c/${joinedChat.id}` : `/join/${grantedRoom}`} className="press inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Open trip <ArrowRight className="size-4" />
              </Link>
            ) : !user ? (
              <button type="button" disabled={isSigningIn} onClick={() => void signIn("google")} className="press inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                {isSigningIn ? <Loader2 className="size-4 animate-spin" /> : <PencilLine className="size-4" />} Sign in to ask to edit
              </button>
            ) : you?.status === "none" ? (
              <button type="button" disabled={requestEdit.isPending} onClick={() => requestEdit.mutate()} className="press inline-flex h-10 items-center gap-2 rounded-xl border border-primary/60 px-4 text-sm font-semibold text-primary hover:bg-accent disabled:opacity-60">
                {requestEdit.isPending ? <Loader2 className="size-4 animate-spin" /> : <PencilLine className="size-4" />} Ask to edit
              </button>
            ) : null}
          </div>

          <div role="tablist" aria-label="Days" className="mt-6 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {[-1, ...trip.days.map((_, i) => i)].map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={scope === i}
                onClick={() => setScope(i)}
                className={cn("shrink-0 rounded-full px-5 py-2 text-[15px] transition-colors", scope === i ? "bg-secondary font-medium text-secondary-foreground" : "hover:bg-muted")}
              >
                {i < 0 ? "Whole trip" : `Day ${i + 1}`}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div ref={daysRef} className="space-y-5">
              {trip.days.map((d, i) =>
                scope >= 0 && scope !== i ? null : (
                  <section key={i} data-day={i} className={cn("surface p-5 transition-shadow duration-300 sm:p-6", focusDay === i && "ring-2 ring-secondary/15")}>
                    <div className="flex items-baseline gap-3">
                      <span className="size-3 rounded-full" style={{ background: dayColor(i) }} />
                      <h2 className="text-[26px] font-semibold text-secondary">Day {i + 1}</h2>
                      <span className="text-sm text-muted-foreground">{dayDate(trip, i).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                    </div>
                    {d.items.length === 0 ? <p className="mt-3 text-muted-foreground">An open day to wander.</p> : null}
                    <ol className="mt-3">
                      {d.items.map((it, k) => {
                        const next = d.items[k + 1];
                        const leg = next ? legs.get(legId(it, next)) : undefined;
                        return (
                          <li key={it.id}>
                            <button type="button" onClick={() => setActiveId(it.id)} className={cn("flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors", activeId === it.id ? "bg-muted" : "hover:bg-muted/50")}>
                              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: dayColor(i) }}>
                                {numberOf[it.id]}
                              </span>
                              <img src={placeImage(it.place)} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm tabular-nums text-muted-foreground">{it.time}</span>
                                <span className="block font-semibold leading-snug">{it.place.name}</span>
                                <span className="block text-[13px] text-muted-foreground">
                                  {it.place.cuisine ?? KIND_LABEL[it.place.kind]} · {it.place.neighborhood}
                                </span>
                              </span>
                            </button>
                            {leg ? (
                              <p className="flex items-center gap-2 py-1 pl-11 text-[12.5px] text-muted-foreground">
                                {leg.mode === "walk" ? <Footprints className="size-3.5" /> : <Bus className="size-3.5" />} {leg.label}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ),
              )}
            </div>
            <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/70 lg:sticky lg:top-24 lg:h-[calc(100vh-130px)]">
              <TripMap stops={mapStops} center={trip.center} activeId={activeId} onSelect={setActiveId} multiDay={scope < 0} labels={scope >= 0} legs={scope >= 0 || focusDay !== undefined} focusDay={focusDay} />
            </div>
          </div>

          <section className="surface mt-10 flex flex-wrap items-center gap-5 p-6 sm:p-8">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">XP Match</p>
              <h2 className="mt-1 text-[30px] font-semibold leading-tight text-secondary">Get a trip matched to your taste</h2>
              <p className="mt-1 text-foreground/75">Chat with an AI concierge that ranks every pick by how well it fits you.</p>
            </div>
            <Link to="/welcome" className="press inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
              Build my Taste Profile <ArrowRight className="size-4" />
            </Link>
          </section>
        </main>
      )}
    </div>
  );
}
