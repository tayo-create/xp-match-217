import { Sparkles } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tagLabel } from "@/data/travelerTypes";
import type { Compatibility } from "@/lib/compat";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";

const tone = (score: number): string => (score >= 80 ? "#C8452D" : score >= 65 ? "#C98A1B" : "#8C8577");

/** "87% taste match" pill that opens a breakdown of why two travelers match. */
export function CompatBadge({ compat, name, className }: { compat: Compatibility; name: string; className?: string }) {
  const color = tone(compat.score);
  const who = firstName(name);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${compat.score}% taste match with ${who}. Show why`}
          className={cn("press inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors hover:bg-muted", className)}
          style={{ borderColor: `${color}55`, color }}
        >
          <CompatRing value={compat.score} color={color} />
          {compat.score}% taste match
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] rounded-2xl p-0">
        <div className="flex items-center gap-3 border-b border-border/70 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full font-display text-[22px] font-bold text-white" style={{ background: color }}>
            {compat.score}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">You & {who}</p>
            <p className="font-display text-[24px] font-semibold leading-tight text-secondary">{compat.label}</p>
          </div>
        </div>
        <ul className="space-y-3 p-4">
          {compat.parts.map((p, i) => (
            <li key={p.id}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-semibold">{p.label}</span>
                <span className="tabular-nums text-muted-foreground">{p.value}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="compat-bar h-full rounded-full" style={{ width: `${p.value}%`, background: p.id === "ratings" ? "#1F2A44" : color, animationDelay: `${i * 70}ms` }} />
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.detail}</p>
            </li>
          ))}
        </ul>
        {compat.sharedTags.length ? (
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {compat.sharedTags.slice(0, 6).map((t) => (
              <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-medium text-primary">
                {tagLabel(t)}
              </span>
            ))}
          </div>
        ) : null}
        {compat.overlaps.length ? (
          <div className="border-t border-border/70 px-4 py-3">
            <p className="eyebrow mb-2">You both rated</p>
            <ul className="space-y-1.5">
              {compat.overlaps.slice(0, 4).map((o) => (
                <li key={o.placeId} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    You <b className="text-foreground">{o.mine.toFixed(1)}</b> · {who} <b className="text-foreground">{o.theirs.toFixed(1)}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 border-t border-border/70 px-4 py-3 text-[12px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Rate places {who} rated to sharpen this score.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CompatRing({ value, color }: { value: number; color: string }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <circle cx="8" cy="8" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" />
    </svg>
  );
}
