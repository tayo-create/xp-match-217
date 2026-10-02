import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STYLE_ROUND } from "@/data/styleRound";
import { DIALS, dialsOf } from "@/lib/match";
import { cn } from "@/lib/utils";
import type { StyleDials } from "@/lib/types";
import { useProfile } from "@/providers/ProfileProvider";

/** Shows the five style dials and lets the traveler (re)answer the this-or-that round. */
export function StyleDialsCard() {
  const { profile, saveDials } = useProfile();
  const dials = dialsOf(profile);
  const estimated = profile.dialsSource !== "quiz";
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState<number>(0);
  const [draft, setDraft] = useState<StyleDials>(dials);

  const start = () => {
    setDraft(dials);
    setStep(0);
    setOpen(true);
  };

  const answer = (value: number) => {
    const q = STYLE_ROUND[step];
    const next = { ...draft, [q.dial]: value };
    setDraft(next);
    if (step < STYLE_ROUND.length - 1) setStep(step + 1);
    else {
      saveDials(next);
      setOpen(false);
      toast.success("Style dials saved", { description: "Every match % now uses your answers." });
    }
  };

  const q = STYLE_ROUND[step];

  return (
    <div className="surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Your style dials</p>
          <p className="mt-1 text-sm text-muted-foreground">{estimated ? "Estimated from your blend. Answer 5 quick this-or-thats to sharpen every score." : "From your this-or-that answers. They make up about 60% of every score."}</p>
        </div>
        <button type="button" onClick={start} className={cn("press shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", estimated ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted")}>
          {estimated ? "Set my dials" : "Redo"}
        </button>
      </div>
      <ul className="mt-5 space-y-4">
        {DIALS.map((d) => (
          <li key={d.id}>
            <div className="flex justify-between text-[13px] font-medium text-foreground/75">
              <span>{d.left}</span>
              <span>{d.right}</span>
            </div>
            <div className="relative mt-1.5 h-2 rounded-full bg-muted">
              <span className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow transition-[left] duration-500", estimated ? "bg-secondary/50" : "bg-primary")} style={{ left: `${dials[d.id]}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[560px]">
          <DialogHeader>
            <p className="eyebrow">
              This or that · {step + 1} / {STYLE_ROUND.length}
            </p>
            <DialogTitle className="font-display text-[32px] font-semibold leading-tight text-secondary">{q.prompt}</DialogTitle>
            <DialogDescription>Go with your gut. There's no wrong answer.</DialogDescription>
          </DialogHeader>
          <div key={q.dial} className="grid gap-3 animate-rise sm:grid-cols-2">
            {[
              { side: q.left, value: 12 },
              { side: q.right, value: 88 },
            ].map(({ side, value }) => (
              <button key={side.label} type="button" onClick={() => answer(value)} className="press rounded-xl border border-border bg-card p-5 text-left hover:border-primary/60 hover:bg-accent">
                <span className="block text-[17px] font-semibold">{side.label}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{side.sub}</span>
              </button>
            ))}
            <button type="button" onClick={() => answer(50)} className="rounded-xl py-2.5 text-sm font-medium text-foreground/70 hover:bg-muted sm:col-span-2">
              <Check className="mr-1 inline size-4" /> Either works
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
