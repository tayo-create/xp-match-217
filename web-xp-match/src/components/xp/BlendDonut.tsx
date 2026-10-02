import { memo } from "react";

import { TRAVELER_TYPES, TYPE_ORDER } from "@/data/travelerTypes";
import { cn } from "@/lib/utils";
import type { Blend } from "@/lib/types";

interface Props {
  blend: Blend;
  size?: number;
  thickness?: number;
  label?: string;
  className?: string;
}

/** Donut chart of a traveler's four-type blend. */
export const BlendDonut = memo(function BlendDonut({ blend, size = 160, thickness = 26, label = "Your travel style", className }: Props) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const order = [...TYPE_ORDER].sort((a, b) => blend[b] - blend[a]);
  let offset = 0;
  const words = label.split(" ");
  const mid = Math.ceil(words.length / 2);

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={order.map((t) => `${blend[t]}% ${TRAVELER_TYPES[t].short}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {order.map((t) => {
          const len = (blend[t] / 100) * c;
          const seg = (
            <circle
              key={t}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TRAVELER_TYPES[t].color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1), stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)" }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {label ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center font-display leading-tight text-foreground" style={{ fontSize: Math.max(12, size / 9.5) }}>
          <span>{words.slice(0, mid).join(" ")}</span>
          <span>{words.slice(mid).join(" ")}</span>
        </div>
      ) : null}
    </div>
  );
});

export const BlendLegend = memo(function BlendLegend({ blend, className }: { blend: Blend; className?: string }) {
  const order = [...TYPE_ORDER].sort((a, b) => blend[b] - blend[a]);
  return (
    <ul className={cn("space-y-2", className)}>
      {order.map((t) => (
        <li key={t} className="flex items-center gap-2.5 text-sm">
          <span className="size-2.5 rounded-full" style={{ background: TRAVELER_TYPES[t].color }} />
          <span className="font-semibold tabular-nums">{blend[t]}%</span>
          <span>{TRAVELER_TYPES[t].short}</span>
        </li>
      ))}
    </ul>
  );
});
