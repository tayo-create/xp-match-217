import { Camera, Check, ChevronDown, Search, ThumbsUp, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MatchPill } from "@/components/xp/MatchPill";
import { StarInput, Stars } from "@/components/xp/Stars";
import { KIND_LABEL, PLACES, PLACE_BY_ID, placeImage, priceLabel } from "@/data/places";
import { IMG } from "@/lib/images";
import { matchPlace, matchTraveler } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { Review } from "@/lib/types";
import { useProfile } from "@/providers/ProfileProvider";
import { useReviews } from "@/providers/ReviewsProvider";

const TAGS_BY_KIND: Record<string, string[]> = {
  eat: ["Great steak", "Worth the price", "Cozy", "Book ahead", "Great service", "Hidden gem", "Great value", "Touristy"],
  do: ["Best at sunset", "Worth the trip", "Crowded", "Peaceful", "Great for photos", "Free"],
  stay: ["Design", "Quiet", "Great location", "Great breakfast", "Friendly staff"],
  nightlife: ["Live music", "Great cocktails", "Local crowd", "Intimate", "Loud"],
  move: ["Scenic", "Easy", "Crowded", "Worth it"],
};

type Sort = "match" | "recent" | "helpful";

const ago = (ms: number): string => {
  const d = Math.round((Date.now() - ms) / 86_400_000);
  if (d < 1) return "today";
  if (d < 7) return `${d}d ago`;
  return `${Math.round(d / 7)}w ago`;
};

/** Yelp-style reviews: write a review, and read reviews weighted by taste match. */
export default function Reviews() {
  const [params, setParams] = useSearchParams();
  const placeId = params.get("place") ?? "avillez";
  const place = PLACE_BY_ID[placeId] ?? PLACE_BY_ID.avillez;
  const { profile } = useProfile();
  const { reviewsFor, stats } = useReviews();
  const [sort, setSort] = useState<Sort>("match");

  const match = useMemo(() => matchPlace(profile, place), [profile, place]);
  const all = reviewsFor(place.id);
  const s = stats(place.id);

  const scored = useMemo(
    () => all.map((r) => ({ review: r, score: r.mine ? 100 : matchTraveler(profile, { blend: r.reviewer.blend, categories: profile.categories, likes: r.reviewer.likes }) })),
    [all, profile],
  );

  const sorted = useMemo(() => {
    const arr = [...scored];
    if (sort === "match") arr.sort((a, b) => b.score - a.score);
    if (sort === "recent") arr.sort((a, b) => b.review.createdAt - a.review.createdAt);
    if (sort === "helpful") arr.sort((a, b) => b.review.helpful - a.review.helpful);
    return arr;
  }, [scored, sort]);

  /** Rating weighted toward reviewers whose taste resembles yours. */
  const tasteRating = useMemo(() => {
    const others = scored.filter((x) => !x.review.mine);
    if (!others.length) return 0;
    const w = others.map((x) => Math.pow(x.score / 100, 4));
    const total = w.reduce((a, b) => a + b, 0);
    return others.reduce((sum, x, i) => sum + x.review.rating * w[i], 0) / total;
  }, [scored]);

  const pick = (id: string) => {
    params.set("place", id);
    setParams(params, { replace: true });
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Reviews</p>
          <h1 className="mt-2 text-5xl font-semibold text-secondary">Reviews from people like you</h1>
          <p className="mt-2 text-lg text-foreground/70">Ratings from travelers who share your taste count the most.</p>
        </div>
        <PlacePicker current={place.id} onPick={pick} />
      </div>

      <div className="surface mt-8 flex flex-wrap items-center gap-6 overflow-hidden p-0 sm:flex-nowrap">
        <img src={placeImage(place)} alt="" className="h-40 w-full object-cover sm:h-36 sm:w-56" />
        <div className="min-w-0 flex-1 px-6 pb-5 sm:p-0">
          <h2 className="text-[34px] font-semibold leading-tight text-secondary">{place.name}</h2>
          <p className="text-muted-foreground">{[place.cuisine ?? KIND_LABEL[place.kind], place.neighborhood, place.city, priceLabel(place.price)].join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <Stars value={s.avg} /> <span>{s.avg ? s.avg.toFixed(1) : "–"} overall · {s.count} reviews</span>
          </div>
        </div>
        <div className="flex gap-6 px-6 pb-6 sm:pb-0 sm:pr-8">
          <div className="text-center">
            <p className="font-display text-[40px] font-semibold leading-none text-primary">{tasteRating ? tasteRating.toFixed(1) : "–"}</p>
            <p className="mt-1 text-xs text-muted-foreground">For your taste</p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <MatchPill match={match} className="px-3 py-1.5 text-sm" />
            <p className="mt-1.5 text-xs text-muted-foreground">Your match</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <ReviewForm key={place.id} placeId={place.id} kind={place.kind} name={place.name} />
        <section aria-label="Reviews">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold text-secondary">{all.length} reviews</h2>
            <div className="flex gap-1 rounded-full bg-muted p-1">
              {(["match", "recent", "helpful"] as Sort[]).map((k) => (
                <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={cn("rounded-full px-3.5 py-1.5 text-sm", sort === k ? "bg-card font-medium shadow-sm" : "text-foreground/70")}>
                  {k === "match" ? "Best match" : k === "recent" ? "Recent" : "Helpful"}
                </button>
              ))}
            </div>
          </div>
          {sorted.length === 0 ? (
            <div className="surface mt-5 p-10 text-center">
              <p className="font-display text-2xl text-secondary">No reviews yet</p>
              <p className="mt-1 text-muted-foreground">Be the first to review {place.name}.</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-4">
              {sorted.map(({ review, score }, i) => (
                <ReviewItem key={review.id} review={review} score={score} index={i} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PlacePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");
  const { stats } = useReviews();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return PLACES.filter((p) => !t || p.name.toLowerCase().includes(t) || p.city.toLowerCase().includes(t) || p.neighborhood.toLowerCase().includes(t)).slice(0, 40);
  }, [q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="press inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-4 font-medium hover:bg-muted">
          <Search className="size-4" /> Review another place <ChevronDown className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places or cities…" aria-label="Search places" className="mb-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
        <ul className="max-h-80 overflow-y-auto scrollbar-thin">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p.id);
                  setOpen(false);
                }}
                className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted", p.id === current && "bg-muted")}
              >
                <img src={placeImage(p)} alt="" className="size-10 rounded-md object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.city} · {stats(p.id).count} reviews</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ReviewForm({ placeId, kind, name }: { placeId: string; kind: string; name: string }) {
  const { profile } = useProfile();
  const { addReview } = useReviews();
  const [rating, setRating] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string>("");

  const options = TAGS_BY_KIND[kind] ?? TAGS_BY_KIND.eat;

  const onFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        setPhoto(c.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return setError("Tap a star to rate your visit.");
    if (body.trim().length < 20) return setError("Tell other travelers a bit more (20+ characters).");
    addReview({
      placeId,
      reviewer: { name: `${profile.name} (you)`, avatar: IMG.me, blend: profile.blend, likes: profile.likes },
      rating,
      title: title.trim() || options[0],
      body: body.trim(),
      tags,
      photo,
    });
    toast.success("Review posted", { description: "Travelers with your taste will see it first." });
    setRating(0);
    setTitle("");
    setBody("");
    setTags([]);
    setPhoto(undefined);
    setError("");
  };

  return (
    <form onSubmit={submit} className="surface h-fit p-6 sm:p-8 lg:sticky lg:top-6" aria-label="Write a review">
      <p className="eyebrow">Write a review</p>
      <h2 className="mt-2 text-[30px] font-semibold text-secondary">Rate your visit to {name}</h2>
      <div className="mt-5">
        <StarInput value={rating} onChange={(v) => { setRating(v); setError(""); }} />
      </div>
      <div className="mt-6">
        <p className="text-sm font-medium">What stood out?</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {options.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTags((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                className={cn("press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors", on ? "border-primary bg-accent text-primary" : "border-border hover:bg-muted")}
              >
                {on ? <Check className="size-3.5" /> : null}
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <label className="mt-6 block">
        <span className="text-sm font-medium">Headline</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} placeholder="e.g. Best ribeye in Lisbon" className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-medium">Your review</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1200} placeholder="What did you order? What was the vibe? Who would love it?" className="mt-1.5 w-full resize-none rounded-lg border border-input bg-card p-3 leading-relaxed outline-none focus:border-primary" />
      </label>
      <div className="mt-4 flex items-center gap-3">
        {photo ? (
          <div className="relative">
            <img src={photo} alt="Your upload" className="h-20 w-28 rounded-lg object-cover" />
            <button type="button" onClick={() => setPhoto(undefined)} aria-label="Remove photo" className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <label className="press inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
            <Camera className="size-4" /> Add a photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
      {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      <button type="submit" className="press mt-6 h-14 w-full rounded-xl bg-primary text-[17px] font-semibold text-primary-foreground hover:bg-primary/90">
        Post review
      </button>
    </form>
  );
}

function ReviewItem({ review, score, index }: { review: Review; score: number; index: number }) {
  const { toggleHelpful, helpfulIds, deleteReview } = useReviews();
  const helped = helpfulIds.includes(review.id);
  const initials = review.reviewer.name.split(" ").map((x) => x[0]).join("").slice(0, 2);
  const avatar = (
    review.reviewer.avatar ? (
      <img src={review.reviewer.avatar} alt="" className="size-12 rounded-full object-cover" />
    ) : (
      <span className="grid size-12 place-items-center rounded-full bg-muted font-semibold text-secondary">{initials}</span>
    )
  );
  return (
    <li className="surface p-5 animate-rise" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-start gap-3">
        {review.reviewer.travelerId ? <Link to={`/travelers/${review.reviewer.travelerId}`}>{avatar}</Link> : avatar}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{review.reviewer.name}</span>
            {review.mine ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">You</span>
            ) : (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", score >= 85 ? "bg-primary text-primary-foreground" : score >= 70 ? "bg-accent text-primary" : "bg-muted text-muted-foreground")}>{score}% match</span>
            )}
            <span className="text-xs text-muted-foreground">· {ago(review.createdAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Stars value={review.rating} />
            <span className="font-medium">{review.title}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-foreground/85">{review.body}</p>
      {review.photo ? <img src={review.photo} alt="" className="mt-3 h-40 w-full max-w-sm rounded-lg object-cover" loading="lazy" /> : null}
      {review.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-2.5 py-1 text-xs">{t}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => toggleHelpful(review.id)} aria-pressed={helped} className={cn("press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", helped ? "border-primary/50 bg-accent text-primary" : "border-border hover:bg-muted")}>
          <ThumbsUp className={cn("size-3.5", helped && "fill-primary/20")} /> Helpful ({review.helpful})
        </button>
        {review.mine ? (
          <button type="button" onClick={() => { deleteReview(review.id); toast("Review deleted"); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" /> Delete
          </button>
        ) : null}
      </div>
    </li>
  );
}
