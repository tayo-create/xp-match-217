import { Camera, Check, ImagePlus, Loader2, MapPinOff, Route, Star } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CITIES, KIND_LABEL, PLACES } from "@/data/places";
import { readPhotoMeta } from "@/lib/exif";
import { distanceKm } from "@/lib/geo";
import { reversePlace, wait } from "@/lib/geocode";
import { compressImage, preparePhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useConcierge } from "@/providers/ConciergeProvider";
import { useList } from "@/providers/ListProvider";
import { useTrips } from "@/providers/TripsProvider";

interface Shot {
  file: File;
  thumb: string;
  lat?: number;
  lng?: number;
  takenAt?: number;
}

/** A cluster of photos taken at one spot, matched to a place. */
interface Stop {
  key: string;
  place: Place;
  shots: Shot[];
  at: number;
  keep: boolean;
}

const MAX_FILES = 60;
const MAX_STOPS = 14;
const CLUSTER_KM = 0.15;
const MATCH_KM = 0.25;

const iso = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Groups photos taken within ~150 m of each other into one stop, in time order. */
const cluster = (shots: Shot[]): Shot[][] => {
  const located = shots.filter((s) => s.lat !== undefined && s.lng !== undefined).sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
  const groups: Shot[][] = [];
  located.forEach((s) => {
    const g = groups.find((x) => distanceKm({ lat: x[0].lat!, lng: x[0].lng! }, { lat: s.lat!, lng: s.lng! }) <= CLUSTER_KM);
    if (g) g.push(s);
    else groups.push([s]);
  });
  return groups.slice(0, MAX_STOPS);
};

/**
 * Camera-roll import: reads where and when each photo was taken, groups them into stops,
 * matches each stop to a place, then lets you rate them or rebuild the trip as an itinerary.
 * Photos are read on this device; only the ones you keep get uploaded.
 */
export function PhotoImport({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { setImported, importLogs } = useList();
  const { createTrip, upsertTrip, placeMany, me } = useTrips();
  const { newChat } = useConcierge();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "reading" | "review" | "saving">("pick");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string }>({ done: 0, total: 0, label: "" });
  const [stops, setStops] = useState<Stop[]>([]);
  const [noLocation, setNoLocation] = useState<number>(0);

  const reset = () => {
    setPhase("pick");
    setStops([]);
    setNoLocation(0);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_FILES);
    if (files.length > MAX_FILES) toast(`Using the first ${MAX_FILES} photos`);
    setPhase("reading");
    const shots: Shot[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, label: "Reading where and when each photo was taken" });
      const f = list[i];
      const meta = await readPhotoMeta(f);
      let thumb = "";
      try {
        thumb = await compressImage(f, 360, 0.7);
      } catch {
        continue;
      }
      shots.push({ file: f, thumb, lat: meta.lat, lng: meta.lng, takenAt: meta.takenAt });
    }
    const groups = cluster(shots);
    setNoLocation(shots.filter((s) => s.lat === undefined).length);

    const found: Stop[] = [];
    for (let i = 0; i < groups.length; i++) {
      setProgress({ done: i, total: groups.length, label: "Matching each spot to a place" });
      const g = groups[i];
      const lat = g.reduce((s, x) => s + x.lat!, 0) / g.length;
      const lng = g.reduce((s, x) => s + x.lng!, 0) / g.length;
      const near = PLACES.map((p) => ({ p, d: distanceKm(p, { lat, lng }) })).sort((a, b) => a.d - b.d)[0];
      let place: Place | null = near && near.d <= MATCH_KM ? near.p : null;
      if (!place) {
        if (i > 0) await wait(1100); // OpenStreetMap asks for at most one lookup per second
        place = await reversePlace(lat, lng);
      }
      if (!place) continue;
      if (found.some((s) => s.place.id === place!.id)) {
        found.find((s) => s.place.id === place!.id)!.shots.push(...g);
        continue;
      }
      found.push({ key: `${place.id}-${i}`, place, shots: g, at: g[0].takenAt ?? Date.now(), keep: true });
    }
    setStops(found.sort((a, b) => a.at - b.at));
    setPhase("review");
  };

  const kept = useMemo(() => stops.filter((s) => s.keep), [stops]);

  /** Uploads one cover photo per kept stop (or keeps a small local copy when signed out). */
  const coverFor = async (s: Stop): Promise<string | undefined> => {
    try {
      return await preparePhoto(s.shots[0].file, Boolean(user));
    } catch {
      return undefined;
    }
  };

  const sendToRate = async () => {
    setPhase("saving");
    const out: { place: Place; photo?: string }[] = [];
    for (let i = 0; i < kept.length; i++) {
      setProgress({ done: i, total: kept.length, label: "Saving your photos" });
      out.push({ place: kept[i].place, photo: await coverFor(kept[i]) });
    }
    setImported(out);
    toast.success(`${out.length} places ready to rate`, { description: "Tap each one to rank it." });
    onOpenChange(false);
    reset();
    navigate("/list?tab=rate");
  };

  const buildTrip = async () => {
    if (!kept.length) return;
    setPhase("saving");
    const covers: (string | undefined)[] = [];
    for (let i = 0; i < kept.length; i++) {
      setProgress({ done: i, total: kept.length, label: "Saving your photos" });
      covers.push(await coverFor(kept[i]));
    }
    const start = iso(kept[0].at);
    const end = iso(kept[kept.length - 1].at);
    const cityCounts = new Map<string, number>();
    kept.forEach((s) => s.place.city && cityCounts.set(s.place.city, (cityCounts.get(s.place.city) ?? 0) + 1));
    const city = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "My trip";
    const trip = createTrip(city, start, end);
    const known = CITIES.some((c) => c.name === city);
    const center: [number, number] = [kept.reduce((s, x) => s + x.place.lat, 0) / kept.length, kept.reduce((s, x) => s + x.place.lng, 0) / kept.length];
    if (!known) upsertTrip({ ...trip, center, blurb: `Rebuilt from ${kept.reduce((n, s) => n + s.shots.length, 0)} photos.` });
    const startMs = new Date(`${start}T00:00:00`).getTime();
    placeMany(
      trip.id,
      kept.map((s) => ({ place: s.place, day: Math.min(trip.days.length - 1, Math.max(0, Math.round((new Date(`${iso(s.at)}T00:00:00`).getTime() - startMs) / 86_400_000))), time: hhmm(s.at) })),
      me,
    );
    // Everything you visited also lands on your list (as "liked") so you can fine-tune the ranking later.
    importLogs(kept.map((s, i) => ({ place: s.place, tier: "liked" as const, details: { visitedOn: iso(s.at), photos: covers[i] ? [covers[i]!] : [] } })));
    newChat({ tripId: trip.id, title: `${city} from my photos` });
    toast.success(`${city} trip rebuilt from your photos`, { description: `${kept.length} stops placed by day and time`, action: { label: "Open", onClick: () => navigate(`/trips/${trip.id}`) } });
    onOpenChange(false);
    reset();
    navigate(`/trips/${trip.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (phase === "reading" || phase === "saving") return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[30px] font-semibold text-secondary">Import from your photos</DialogTitle>
          <DialogDescription>We read where and when each photo was taken, group them into stops, and match each stop to a place. Photos stay on your device until you save.</DialogDescription>
        </DialogHeader>

        {phase === "pick" ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="press flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center hover:border-primary/60">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <ImagePlus className="size-6" />
            </span>
            <span className="font-display text-xl font-semibold text-secondary">Choose photos from a trip</span>
            <span className="max-w-sm text-sm text-muted-foreground">Pick up to {MAX_FILES}. Original JPEGs from your phone work best, since screenshots and messaging apps strip the location.</span>
          </button>
        ) : null}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ""))} />

        {phase === "reading" || phase === "saving" ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <p className="mt-4 font-semibold">{progress.label}</p>
            <div className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {progress.done} / {progress.total}
            </p>
          </div>
        ) : null}

        {phase === "review" ? (
          stops.length ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Camera className="size-4 text-primary" /> Found {stops.length} {stops.length === 1 ? "stop" : "stops"}
                {noLocation ? <span className="font-normal text-muted-foreground">· {noLocation} photos had no location</span> : null}
              </p>
              <ol className="mt-3 space-y-2">
                {stops.map((s) => (
                  <li key={s.key} className={cn("flex items-center gap-3 rounded-xl border p-2 transition-opacity", s.keep ? "border-border bg-card" : "border-dashed border-border opacity-50")}>
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img src={s.shots[0].thumb} alt="" className="h-full w-full object-cover" />
                      {s.shots.length > 1 ? <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{s.shots.length}</span> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.place.name}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {new Date(s.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {hhmm(s.at)} · {[KIND_LABEL[s.place.kind], s.place.neighborhood || s.place.city].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStops((prev) => prev.map((x) => (x.key === s.key ? { ...x, keep: !x.keep } : x)))}
                      aria-pressed={s.keep}
                      aria-label={s.keep ? `Leave out ${s.place.name}` : `Include ${s.place.name}`}
                      className={cn("press grid size-9 shrink-0 place-items-center rounded-full border", s.keep ? "border-[#3F8A63] bg-[#3F8A63] text-white" : "border-border text-transparent")}
                    >
                      <Check className="size-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={!kept.length} onClick={() => void sendToRate()} className="press flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card font-semibold hover:bg-muted disabled:opacity-40">
                  <Star className="size-4" /> Rate these {kept.length}
                </button>
                <button type="button" disabled={!kept.length} onClick={() => void buildTrip()} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  <Route className="size-4" /> Rebuild as a trip
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <MapPinOff className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">No locations in these photos</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Location is often removed when photos are shared or screenshotted. Try the originals from your camera roll, or search for places by name instead.</p>
              <button type="button" onClick={reset} className="press mt-4 h-11 rounded-xl border border-border px-5 font-semibold hover:bg-muted">
                Try other photos
              </button>
            </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
