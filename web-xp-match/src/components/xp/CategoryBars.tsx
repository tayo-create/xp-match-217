import { BedDouble, Binoculars, TramFront, UtensilsCrossed } from "lucide-react";
import { memo } from "react";

import { CATEGORY_INFO } from "@/data/travelerTypes";
import { cn } from "@/lib/utils";
import type { CategoryId, CategoryScores } from "@/lib/types";

const ICONS: Record<CategoryId, typeof UtensilsCrossed> = {
  eat: UtensilsCrossed,
  do: Binoculars,
  stay: BedDouble,
  move: TramFront,
};

const ORDER: CategoryId[] = ["eat", "do", "stay", "move"];

const blurb = (c: CategoryId, v: number): string =>
  v >= 80 ? CATEGORY_INFO[c].blurbHigh : v >= 55 ? CATEGORY_INFO[c].blurbMid : CATEGORY_INFO[c].blurbLow;

/** Four-column coefficient bars for Eat / Do / Stay / Getting around. */
export const CategoryBars = memo(function CategoryBars({ categories, compact, className }: { categories: CategoryScores; compact?: boolean; className?: string }) {
  return (
    <div className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-border", className)}>
      {ORDER.map((c, i) => {
        const Icon = ICONS[c];
        return (
          <div key={c} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
            <div className="flex items-center gap-3">
              <Icon className="size-6 text-secondary" strokeWidth={1.6} />
              <span className="text-[16px] font-medium">{CATEGORY_INFO[c].label}</span>
              <span className="ml-auto font-display text-[26px] font-semibold tabular-nums text-secondary">{categories[c]}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary animate-grow-x" style={{ width: `${categories[c]}%`, animationDelay: `${i * 120}ms` }} />
            </div>
            {!compact ? <p className="mt-3 text-[14.5px] leading-snug text-foreground/75">{blurb(c, categories[c])}</p> : null}
          </div>
        );
      })}
    </div>
  );
});
