import { Star } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "@/lib/utils";

export const Stars = memo(function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(value) ? "fill-primary text-primary" : "fill-transparent text-border"}
          strokeWidth={1.6}
        />
      ))}
    </span>
  );
});

const LABELS = ["", "Not for me", "It was okay", "Good", "Great", "Loved it"];

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState<number>(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-4">
      <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className="press rounded-md p-0.5"
          >
            <Star
              className={cn(
                "size-9 transition-colors",
                i <= shown ? "fill-primary text-primary" : "fill-transparent text-border hover:text-primary/50",
              )}
              strokeWidth={1.4}
            />
          </button>
        ))}
      </div>
      <span className="font-display text-lg text-muted-foreground">{LABELS[shown]}</span>
    </div>
  );
}
