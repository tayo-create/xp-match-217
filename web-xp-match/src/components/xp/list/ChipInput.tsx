import { Plus, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  label: string;
  suggestions?: string[];
  max?: number;
}

/** Free-text chips: type and press Enter (or comma) to add; tap a suggestion to add it. */
export function ChipInput({ value, onChange, placeholder, label, suggestions = [], max = 10 }: Props) {
  const [draft, setDraft] = useState<string>("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "").slice(0, 60);
    if (!v || value.some((x) => x.toLowerCase() === v.toLowerCase()) || value.length >= max) return;
    onChange([...value, v]);
  };
  const open = suggestions.filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 6);

  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 focus-within:border-primary/60">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[13px] font-medium text-secondary-foreground">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="opacity-70 hover:opacity-100">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) {
              add(v);
              setDraft("");
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
            if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => {
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
          aria-label={label}
          placeholder={value.length ? "" : placeholder}
          className="h-8 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-foreground/40"
        />
      </div>
      {open.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[12.5px] text-foreground/70 hover:border-primary/50 hover:text-primary")}>
              <Plus className="size-3" /> {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
