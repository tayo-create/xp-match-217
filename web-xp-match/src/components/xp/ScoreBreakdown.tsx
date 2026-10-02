import { Info } from "lucide-react";
import { memo } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { PlaceScores } from "@/hooks/use-trip-people";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";

/** Big group score with one labeled bar per person, plus a "Split" flag when people disagree. */
export const TwinBars = memo(function TwinBars({ scores, compact, className }: { scores: PlaceScores; compact?: boolean; className?: string }) {
  const split = scores.spread >= 30;
  return (
    <div className={cn("space-y-1.5", className)}>
      {scores.per.map(({ person, score }) => (
        <div key={person.id} className="grid grid-cols-[64px_1fr_28px] items-center gap-2 text-[12px]">
          <span className="truncate font-semibold" style={{ color: person.color }}>
            {person.isMe ? "You" : firstName(person.name)}
          </span>
          <span className={cn("relative overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2")}>
            <span className="xp-bar absolute inset-y-0 left-0 rounded-full" style={{ width: `${score.score}%`, background: person.color }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{score.score}</span>
        </div>
      ))}
      {split ? <p className="text-[11.5px] font-semibold text-[#B7791F]">Split: {scores.spread} points apart</p> : null}
    </div>
  );
});

/** The "i" badge: per-person reasoning behind each score. */
export const WhyBadge = memo(function WhyBadge({ scores, className }: { scores: PlaceScores; className?: string }) {
  const isGroup = scores.per.length > 1;
  return (
    <HoverCard openDelay={100} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button type="button" aria-label="Why these scores" className={cn("grid size-7 place-items-center rounded-full bg-card/95 text-secondary shadow-sm hover:bg-card", className)}>
          <Info className="size-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 rounded-xl border-border/80 p-4" align="end">
        {isGroup ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Group {scores.group} = half the average, half the lowest score. Consensus beats one person's enthusiasm.
          </p>
        ) : null}
        <div className="space-y-3">
          {scores.per.map(({ person, score }) => (
            <div key={person.id}>
              <p className="flex items-baseline justify-between text-sm font-semibold">
                <span style={{ color: person.color }}>{person.isMe ? "You" : firstName(person.name)}</span>
                <span className="tabular-nums">{score.score}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Interest fit {Math.round(score.interest * 100)} · Style fit {Math.round(score.style * 100)}
              </p>
              <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-foreground/85">
                {score.reasons.map((r) => (
                  <li key={r} className="flex gap-1.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: person.color }} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
