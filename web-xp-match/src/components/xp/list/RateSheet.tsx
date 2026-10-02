import { Camera, Check, Frown, Heart, Loader2, Smile, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ChipInput } from "@/components/xp/list/ChipInput";
import { KIND_LABEL, placeImage } from "@/data/places";
import { photoSrc, preparePhoto } from "@/lib/photos";
import { TIER_META, TIERS, compareDone, compareMid, compareStart, compareStep, compareTotal, scoreAt, type CompareState } from "@/lib/ranking";
import { cn } from "@/lib/utils";
import type { ListTier, Place } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useList } from "@/providers/ListProvider";
import { useSocial } from "@/providers/SocialProvider";

const TIER_ICON = { loved: Heart, liked: Smile, meh: Frown } as const;

const FAVORITE_HINT: Record<string, string> = {
  eat: "Favorite dishes",
  nightlife: "Favorite drinks",
  stay: "Best things about it",
  do: "Highlights",
  move: "Highlights",
};

const FAVORITE_SUGGEST: Record<string, string[]> = {
  eat: ["The tasting menu", "Dessert", "House wine"],
  nightlife: ["Signature cocktail", "Natural wine", "The view"],
  stay: ["The room", "Breakfast", "The pool", "Location"],
  do: ["Sunset", "The guide", "Skipping the line"],
  move: ["The views", "Easy ride"],
};

const today = (): string => new Date().toISOString().slice(0, 10);

/** App-wide rating flow: tap a tier, answer a few "which was better?" questions, then add memories. */
export function RateSheet() {
  const { rateTarget, closeRate } = useList();
  return (
    <Dialog open={rateTarget !== null} onOpenChange={(o) => (!o ? closeRate() : undefined)}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[520px] [&>button]:hidden">
        {rateTarget ? <RateFlow key={`${rateTarget.place.id}-${rateTarget.step}`} place={rateTarget.place} startStep={rateTarget.step} startTier={rateTarget.tier} startPhoto={rateTarget.photo} onClose={closeRate} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RateFlow({ place, startStep, startTier, startPhoto, onClose }: { place: Place; startStep: "tier" | "compare" | "details"; startTier?: ListTier; startPhoto?: string; onClose: () => void }) {
  const { byTier, logFor, placeLog, updateLog, removeLog, autoShare, setAutoShare, canShare } = useList();
  const existing = logFor(place.id);
  const [step, setStep] = useState<"tier" | "compare" | "details">(startStep === "compare" ? "tier" : startStep);
  const [tier, setTier] = useState<ListTier>(startTier ?? existing?.log.tier ?? "loved");
  const others = useMemo(() => byTier[tier].filter((l) => l.id !== place.id), [byTier, tier, place.id]);
  const [cmp, setCmp] = useState<CompareState>(() => compareStart(others.length));
  const [asked, setAsked] = useState<number>(0);
  const [placedScore, setPlacedScore] = useState<number | null>(existing?.score ?? null);

  const finishPlacement = (t: ListTier, index: number) => {
    const count = byTier[t].filter((l) => l.id !== place.id).length + 1;
    placeLog(place, t, index, startPhoto && !existing?.log.photos.includes(startPhoto) ? { photos: [...(existing?.log.photos ?? []), startPhoto].slice(0, 4) } : undefined);
    setPlacedScore(scoreAt(t, index, count));
    setStep("details");
  };

  const chooseTier = (t: ListTier) => {
    setTier(t);
    const pool = byTier[t].filter((l) => l.id !== place.id);
    if (!pool.length) return finishPlacement(t, 0);
    setCmp(compareStart(pool.length));
    setAsked(0);
    setStep("compare");
  };

  const answer = (newIsBetter: boolean) => {
    const next = compareStep(cmp, newIsBetter);
    setAsked((n) => n + 1);
    if (compareDone(next)) return finishPlacement(tier, next.lo);
    setCmp(next);
  };

  // Opened straight from a tier button (quick-rate stream): skip the tier question.
  const started = useRef<boolean>(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (startStep === "compare" && startTier) chooseTier(startTier);
  });

  // Keyboard shortcuts for the compare step: ← new place, → the other one.
  useEffect(() => {
    if (step !== "compare") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") answer(true);
      if (e.key === "ArrowRight") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const meta = [place.cuisine ?? KIND_LABEL[place.kind], place.neighborhood, place.city].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="relative h-36 overflow-hidden rounded-t-2xl bg-muted">
        <img src={startPhoto ? photoSrc(startPhoto) : existing?.log.photos[0] ? photoSrc(existing.log.photos[0]) : placeImage(place)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F2A44]/85 via-[#1F2A44]/25 to-transparent" />
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/35 text-white hover:bg-black/50">
          <X className="size-4" />
        </button>
        <div className="absolute inset-x-5 bottom-4 text-white">
          <DialogTitle className="font-display text-[28px] font-semibold leading-tight">{place.name}</DialogTitle>
          <DialogDescription className="text-[13px] text-white/80">{meta}</DialogDescription>
        </div>
        {placedScore !== null && step === "details" ? (
          <span className="absolute bottom-4 right-5 grid size-14 place-items-center rounded-full font-display text-[22px] font-bold text-white shadow-lg" style={{ background: TIER_META[tier].color }}>
            {placedScore.toFixed(1)}
          </span>
        ) : null}
      </div>

      {step === "tier" ? (
        <div className="p-5">
          <p className="text-center font-display text-[22px] font-semibold text-secondary">How was it?</p>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {TIERS.map((t) => {
              const Icon = TIER_ICON[t];
              const on = existing?.log.tier === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => chooseTier(t)}
                  className={cn("press group flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 transition-colors", on ? "border-current" : "border-border hover:border-current")}
                  style={{ color: TIER_META[t].color }}
                >
                  <span className="grid size-12 place-items-center rounded-full text-white transition-transform group-hover:scale-110" style={{ background: TIER_META[t].color }}>
                    <Icon className="size-6" />
                  </span>
                  <span className="text-[14px] font-semibold text-foreground">{TIER_META[t].label}</span>
                </button>
              );
            })}
          </div>
          {existing ? (
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => setStep("details")} className="font-semibold text-primary hover:underline">
                Just edit details
              </button>
              <button
                type="button"
                onClick={() => {
                  removeLog(place.id);
                  toast(`Removed ${place.name} from your list`);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Remove from list
              </button>
            </div>
          ) : (
            <p className="mt-4 text-center text-[12.5px] text-muted-foreground">Then we'll ask a couple of quick "which was better?" questions to rank it.</p>
          )}
        </div>
      ) : null}

      {step === "compare" ? (
        <CompareStep place={place} other={others[compareMid(cmp)]?.place} asked={asked} total={compareTotal(others.length)} onAnswer={answer} onSkip={() => finishPlacement(tier, cmp.lo + Math.floor((cmp.hi - cmp.lo) / 2))} />
      ) : null}

      {step === "details" ? (
        <DetailsStep
          placeId={place.id}
          kind={place.kind}
          initial={existing?.log}
          autoShare={autoShare}
          setAutoShare={setAutoShare}
          canShare={canShare}
          onSave={(patch, share) => {
            updateLog(place.id, patch, { share });
            toast.success(`${place.name} saved to your list`, { description: share && canShare ? "Shared to the feed" : undefined });
            onClose();
          }}
        />
      ) : null}
    </div>
  );
}

function CompareStep({ place, other, asked, total, onAnswer, onSkip }: { place: Place; other?: Place; asked: number; total: number; onAnswer: (newIsBetter: boolean) => void; onSkip: () => void }) {
  if (!other) return null;
  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-[22px] font-semibold text-secondary">Which did you like more?</p>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {Math.min(asked + 1, total)} / {total}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <CompareCard place={place} onClick={() => onAnswer(true)} hint="←" />
        <span className="self-center font-display text-lg italic text-muted-foreground">or</span>
        <CompareCard key={other.id} place={other} onClick={() => onAnswer(false)} hint="→" />
      </div>
      <button type="button" onClick={onSkip} className="mx-auto mt-4 block text-sm font-medium text-muted-foreground hover:text-foreground">
        Too close to call
      </button>
    </div>
  );
}

function CompareCard({ place, onClick, hint }: { place: Place; onClick: () => void; hint: string }) {
  return (
    <button type="button" onClick={onClick} className="press xp-rerank group overflow-hidden rounded-2xl border-2 border-border bg-card text-left transition-colors hover:border-primary">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img src={placeImage(place)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug">{place.name}</p>
        <p className="mt-0.5 flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="truncate">{place.neighborhood || place.city}</span>
          <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">{hint}</kbd>
        </p>
      </div>
    </button>
  );
}

function DetailsStep({
  placeId,
  kind,
  initial,
  autoShare,
  setAutoShare,
  canShare,
  onSave,
}: {
  placeId: string;
  kind: string;
  initial?: { visitedOn?: string; photos: string[]; favorites: string[]; with: string[]; note: string };
  autoShare: boolean;
  setAutoShare: (v: boolean) => void;
  canShare: boolean;
  onSave: (patch: { visitedOn?: string; photos: string[]; favorites: string[]; with: string[]; note: string }, share: boolean) => void;
}) {
  const { user } = useAuth();
  const { travelers } = useSocial();
  const { logFor } = useList();
  const live = logFor(placeId)?.log;
  const [visitedOn, setVisitedOn] = useState<string>(live?.visitedOn ?? initial?.visitedOn ?? today());
  const [photos, setPhotos] = useState<string[]>(live?.photos ?? initial?.photos ?? []);
  const [favorites, setFavorites] = useState<string[]>(live?.favorites ?? initial?.favorites ?? []);
  const [withWho, setWithWho] = useState<string[]>(live?.with ?? initial?.with ?? []);
  const [note, setNote] = useState<string>(live?.note ?? initial?.note ?? "");
  const [share, setShare] = useState<boolean>(autoShare);
  const [uploading, setUploading] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 4 - photos.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast(`Up to 4 photos per place`);
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const ref = await preparePhoto(f, Boolean(user));
        setPhotos((p) => [...p, ref].slice(0, 4));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't add that photo.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const companionSuggestions = useMemo(() => ["Partner", "Friends", "Family", "Solo", ...travelers.slice(0, 4).map((t) => t.name.split(" ")[0])], [travelers]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (uploading) return;
        if (share !== autoShare) setAutoShare(share);
        onSave({ visitedOn, photos, favorites, with: withWho, note: note.trim() }, share);
      }}
      className="space-y-4 p-5"
    >
      <div>
        <p className="text-sm font-semibold">Photos</p>
        <div className="mt-1.5 flex gap-2">
          {photos.map((p) => (
            <span key={p} className="group relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
              <img src={photoSrc(p)} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y !== p))} aria-label="Remove photo" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <span key={`u${i}`} className="grid size-20 shrink-0 place-items-center rounded-xl bg-muted">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </span>
          ))}
          {photos.length + uploading < 4 ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="press grid size-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-primary">
              <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                <Camera className="size-5" /> Add
              </span>
            </button>
          ) : null}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ""))} />
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">When did you go?</span>
        <input type="date" value={visitedOn} max={today()} onChange={(e) => setVisitedOn(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 sm:w-48" />
      </label>

      <div>
        <p className="mb-1.5 text-sm font-semibold">{FAVORITE_HINT[kind] ?? "Favorites"}</p>
        <ChipInput value={favorites} onChange={setFavorites} label={FAVORITE_HINT[kind] ?? "Favorites"} placeholder="Type one and press Enter" suggestions={FAVORITE_SUGGEST[kind] ?? []} />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Who you went with</p>
        <ChipInput value={withWho} onChange={setWithWho} label="Who you went with" placeholder="Names, or Solo" suggestions={companionSuggestions} />
      </div>

      <label className="block">
        <span className="text-sm font-semibold">A line about it</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder="Get the octopus. Ask for the window table." className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
      </label>

      {canShare ? (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5 py-3">
          <span>
            <span className="block text-sm font-semibold">Share to the feed</span>
            <span className="block text-xs text-muted-foreground">Your rating, photos and favorites help other travelers</span>
          </span>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="size-5 accent-[#C8452D]" />
        </label>
      ) : (
        <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-xs text-muted-foreground">Saved on this device. Sign in to share ratings with other travelers.</p>
      )}

      <button type="submit" disabled={uploading > 0} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {uploading ? "Uploading photos…" : "Save"}
      </button>
    </form>
  );
}
