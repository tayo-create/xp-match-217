import { Sparkles } from "lucide-react";
import { memo } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { TRAVELER_TYPES } from "@/data/travelerTypes";
import { cn } from "@/lib/utils";
import type { MatchResult } from "@/lib/types";

interface Props {
  match: MatchResult;
  suffix?: string;
  className?: string;
}

/** Terracotta match % badge; hovering or focusing reveals why it matches. */
export const MatchPill = memo(function MatchPill({ match, suffix = "match", className }: Props) {
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button type="button" className={cn("match-pill cursor-help", className)} aria-label={`${match.score}% match. Why this matches you`}>
          {match.score}%{suffix ? ` ${suffix}` : ""}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 rounded-xl border-border/80 p-4" align="end">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          <Sparkles className="size-3.5" /> Why it's {match.score}%
        </div>
        <ul className="space-y-1.5 text-sm leading-snug text-foreground/85">
          {match.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: TRAVELER_TYPES[match.dominantType].color }} />
              {r}
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
});
