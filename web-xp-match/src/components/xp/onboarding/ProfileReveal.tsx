import { ArrowRight, Heart, RotateCcw } from "lucide-react";

import { BlendDonut } from "@/components/xp/BlendDonut";
import { CategoryBars } from "@/components/xp/CategoryBars";
import { TRAVELER_TYPES, tagLabel } from "@/data/travelerTypes";
import { dominantType, sortedTypes } from "@/lib/match";
import type { TasteProfile } from "@/lib/types";

/** Result screen shown after the quiz or interview. */
export function ProfileReveal({ profile, onConfirm, onRetake }: { profile: TasteProfile; onConfirm: () => void; onRetake: () => void }) {
  const top = TRAVELER_TYPES[dominantType(profile.blend)];
  const order = sortedTypes(profile.blend);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-rise">
          <p className="eyebrow">{profile.name}, your Taste Profile</p>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.02] text-secondary sm:text-6xl">Primarily {top.name.replace("The ", "a ")}</h1>
          <p className="mt-4 text-lg text-foreground/80">{order.map((t) => `${profile.blend[t]}% ${TRAVELER_TYPES[t].short}`).join(" · ")}</p>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-foreground/80">{profile.summary}</p>
          {profile.likes.length ? (
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
              <Heart className="size-4 fill-primary text-primary" />
              Loves {profile.likes.slice(0, 5).map(tagLabel).join(" · ")}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={onConfirm} className="press inline-flex h-14 items-center gap-3 rounded-xl bg-primary px-7 text-[17px] font-semibold text-primary-foreground hover:bg-primary/90">
              Start planning <ArrowRight className="size-5" />
            </button>
            <button type="button" onClick={onRetake} className="press inline-flex h-14 items-center gap-2 rounded-xl border border-border px-5 font-medium hover:bg-muted">
              <RotateCcw className="size-4" /> Retake
            </button>
          </div>
        </div>
        <div className="surface flex flex-col items-center gap-6 p-8 animate-rise sm:flex-row" style={{ animationDelay: "150ms" }}>
          <BlendDonut blend={profile.blend} size={220} thickness={36} />
          <ul className="space-y-4">
            {order.map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: TRAVELER_TYPES[t].color }} />
                <div>
                  <p className="font-semibold">
                    {profile.blend[t]}% {TRAVELER_TYPES[t].short}
                  </p>
                  <p className="text-sm text-muted-foreground">{TRAVELER_TYPES[t].traits}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="surface mt-10 p-6 sm:p-8 animate-rise" style={{ animationDelay: "250ms" }}>
        <p className="eyebrow mb-5">Your travel coefficients</p>
        <CategoryBars categories={profile.categories} />
      </div>
    </div>
  );
}
