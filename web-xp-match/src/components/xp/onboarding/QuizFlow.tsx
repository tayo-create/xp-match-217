import { ArrowLeft, ArrowRight, Check, Heart } from "lucide-react";
import { useState } from "react";

import { QUIZ } from "@/data/quiz";
import { profileFromQuiz, type QuizAnswers } from "@/lib/buildProfile";
import { cn } from "@/lib/utils";
import type { TasteProfile } from "@/lib/types";

/** Step-by-step 12-question questionnaire with a name step first. */
export function QuizFlow({ onDone }: { onDone: (p: TasteProfile) => void }) {
  const [name, setName] = useState<string>("");
  const [index, setIndex] = useState<number>(-1);
  const [answers, setAnswers] = useState<QuizAnswers>({});

  const total = QUIZ.length;
  const q = index >= 0 ? QUIZ[index] : undefined;
  const selected = q ? answers[q.id] ?? [] : [];
  const progress = ((index + 1) / (total + 1)) * 100;

  const next = () => {
    if (index < total - 1) setIndex(index + 1);
    else onDone(profileFromQuiz(answers, name));
  };

  const choose = (optId: string) => {
    if (!q) return;
    if (q.multi) {
      setAnswers((a) => {
        const cur = a[q.id] ?? [];
        if (q.loveable) {
          // none -> like -> love -> none
          if (cur.includes(`${optId}!`)) return { ...a, [q.id]: cur.filter((x) => x !== `${optId}!`) };
          if (cur.includes(optId)) return { ...a, [q.id]: cur.map((x) => (x === optId ? `${optId}!` : x)) };
          return { ...a, [q.id]: [...cur, optId] };
        }
        return { ...a, [q.id]: cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId] };
      });
      return;
    }
    setAnswers((a) => ({ ...a, [q.id]: [optId] }));
    window.setTimeout(() => {
      setIndex((i) => {
        if (i < total - 1) return i + 1;
        onDone(profileFromQuiz({ ...answers, [q.id]: [optId] }, name));
        return i;
      });
    }, 260);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-8">
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{index < 0 ? "Intro" : `${index + 1} / ${total}`}</span>
      </div>

      {index < 0 ? (
        <form
          key="name"
          className="mt-14 animate-rise"
          onSubmit={(e) => {
            e.preventDefault();
            setIndex(0);
          }}
        >
          <p className="eyebrow">First things first</p>
          <h1 className="mt-3 text-4xl font-semibold text-secondary sm:text-5xl">What should we call you?</h1>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            aria-label="Your first name"
            className="mt-8 w-full border-b-2 border-border bg-transparent pb-3 font-display text-3xl outline-none transition-colors placeholder:text-foreground/30 focus:border-primary"
          />
          <button type="submit" className="press mt-10 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
            Let's go <ArrowRight className="size-4" />
          </button>
        </form>
      ) : q ? (
        <div key={q.id} className="mt-12 animate-rise">
          <p className="eyebrow">{q.kicker}</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight text-secondary sm:text-5xl">{q.prompt}</h1>
          {q.loveable ? <p className="mt-3 text-sm text-muted-foreground">Loves count double when we score places for you.</p> : null}
          <div className={cn("mt-8 grid gap-3", q.multi ? "grid-cols-2 sm:grid-cols-4" : q.versus ? "sm:grid-cols-2 [&>*:nth-child(3)]:sm:col-span-2" : "sm:grid-cols-2")}>
            {q.options.map((o, i) => {
              const loved = selected.includes(`${o.id}!`);
              const on = selected.includes(o.id) || loved;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o.id)}
                  aria-pressed={on}
                  className={cn(
                    "press group relative rounded-xl border bg-card text-left transition-all animate-rise",
                    q.multi ? "px-3.5 py-3 text-[14px]" : q.versus && o.id !== "c" ? "px-5 py-6 text-[17px]" : "px-5 py-4 text-[16px]",
                    q.versus && o.id === "c" && "py-3 text-center text-[14px]",
                    loved ? "border-primary bg-primary text-primary-foreground" : on ? "border-primary bg-accent shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border hover:border-primary/50 hover:bg-card/60",
                  )}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {q.loveable && on ? (
                    <Heart className={cn("absolute right-2.5 top-2.5 size-3.5", loved ? "fill-primary-foreground text-primary-foreground" : "text-primary")} aria-label={loved ? "Love" : "Like"} />
                  ) : null}
                  <span className={cn("flex items-start gap-3", q.versus && o.id === "c" && "justify-center")}>
                    {!q.multi && !(q.versus && o.id === "c") ? (
                      <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                        {on ? <Check className="size-3.5" /> : String.fromCharCode(65 + i)}
                      </span>
                    ) : null}
                    <span>
                      <span className="block font-medium">{o.label}</span>
                      {o.sub ? <span className={cn("mt-0.5 block text-sm", loved ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.sub}</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-10 flex items-center justify-between">
            <button type="button" onClick={() => setIndex(index - 1)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Back
            </button>
            {q.multi || selected.length > 0 ? (
              <button
                type="button"
                onClick={next}
                disabled={q.multi && selected.length === 0}
                className="press inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {index === total - 1 ? "Reveal my Taste Profile" : "Next"} <ArrowRight className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
