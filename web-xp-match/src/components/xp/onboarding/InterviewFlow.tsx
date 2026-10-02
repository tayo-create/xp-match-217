import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ALL_TAGS } from "@/data/travelerTypes";
import { chatJson, type AiMessage } from "@/lib/ai";
import { profileFromAi, type AiProfileDraft } from "@/lib/buildProfile";
import { cn } from "@/lib/utils";
import type { TasteProfile } from "@/lib/types";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface InterviewReply {
  reply: string;
  done?: boolean;
  name?: string;
  profile?: AiProfileDraft;
}

const OPENER = "Hi, I'm your XP Match concierge. Before I plan anything, I'd love to get to know how you travel. First — what's your name, and where was the last trip that really stuck with you?";

const SYSTEM = `You are the XP Match onboarding interviewer: warm, curious, concise. Over about 6-8 questions, learn how this person travels so you can build their Taste Profile.

The Taste Profile is a blend of four traveler types (percentages summing to 100):
- trailblazer: bold, social, spontaneous (Sanguine / Promoter) — adventure, crowds, nightlife, new experiences
- architect: driven, efficient, ambitious (Choleric / Controller) — plans, top-rated, efficiency, iconic sights
- curator: curious, detailed, discerning (Melancholic / Analyzer) — culture, chef-driven food, research, hidden gems
- drifter: easygoing, cozy, unhurried (Phlegmatic / Supporter) — slow mornings, comfort, flexibility, long lunches
Plus category coefficients 0-100 for how much each matters: eat, do, stay, move (getting around).

Cover: their name, a memorable trip, food (be specific — e.g. what kind of steak place), activities, where they stay, how they get around, pace/planning, budget, nightlife. Ask ONE question at a time, react briefly and specifically to what they said (one short sentence), then ask the next question. Keep each reply under 45 words. No markdown.

When you have enough (after 6-8 user answers, or if the user asks to finish), set done=true and include the profile. Allowed like/dislike tags: ${ALL_TAGS.join(", ")}.

Always reply ONLY with JSON:
{"reply": string, "done": boolean, "name": string|null, "profile": null | {"blend": {"curator": n, "drifter": n, "trailblazer": n, "architect": n}, "categories": {"eat": n, "do": n, "stay": n, "move": n}, "likes": string[], "dislikes": string[], "budget": 1|2|3, "summary": "2 sentences in second person describing how they travel"}}
When done, "reply" should be a short warm sign-off like "That's everything I need — let me show you your Taste Profile."`;

/** Conversational AI interview that produces a Taste Profile. */
export function InterviewFlow({ onDone, onFallbackToQuiz }: { onDone: (p: TasteProfile) => void; onFallbackToQuiz: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", text: OPENER }]);
  const [input, setInput] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const answered = turns.filter((t) => t.role === "user").length;
  const progress = Math.min(100, (answered / 7) * 100);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const send = async (text: string, forceFinish = false) => {
    const body = text.trim();
    if ((!body && !forceFinish) || busy) return;
    const nextTurns: Turn[] = body ? [...turns, { role: "user", text: body }] : turns;
    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    setFailed(false);
    try {
      const messages: AiMessage[] = [
        { role: "system", content: SYSTEM },
        ...nextTurns.map((t) => ({ role: t.role, content: t.text })),
      ];
      if (forceFinish) messages.push({ role: "user", content: "That's all I have time for — please build my Taste Profile now (done=true)." });
      const res = await chatJson<InterviewReply>(messages, { temperature: 0.6 });
      const newName = res.name && res.name !== "null" ? res.name : name;
      if (newName) setName(newName);
      setTurns((t) => [...t, { role: "assistant", text: res.reply }]);
      if (res.done && res.profile) {
        const profile = profileFromAi(res.profile, newName || "Traveler");
        window.setTimeout(() => onDone(profile), 1400);
      }
    } catch (e) {
      console.warn("[interview] failed", e instanceof Error ? e.message : e);
      setFailed(true);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-72px)] max-w-3xl flex-col px-4 sm:px-8">
      <div className="flex items-center gap-4 pt-6">
        <div className="grid size-11 place-items-center rounded-full bg-secondary font-display text-lg font-semibold text-secondary-foreground">XP</div>
        <div className="flex-1">
          <p className="font-display text-xl text-secondary">Taste Profile interview</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {answered >= 4 ? (
          <button type="button" onClick={() => send("", true)} disabled={busy} className="rounded-full border border-primary/50 px-3.5 py-1.5 text-sm font-medium text-primary hover:bg-accent disabled:opacity-50">
            Finish now
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex-1 space-y-5 overflow-y-auto pb-6 scrollbar-thin" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={cn("flex animate-rise", t.role === "user" ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-5 py-3.5 text-[16px] leading-relaxed",
                t.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card shadow-sm ring-1 ring-border/70",
              )}
            >
              {t.text}
            </p>
          </div>
        ))}
        {busy ? (
          <div className="flex gap-1.5 px-2 py-3" aria-label="Concierge is typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot size-2 rounded-full bg-foreground/50" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        ) : null}
        {failed ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>The interviewer couldn't respond just now.</p>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => send(turns[turns.length - 1]?.role === "user" ? "" : input, false)} className="font-semibold text-primary">
                Try again
              </button>
              <button type="button" onClick={onFallbackToQuiz} className="text-muted-foreground underline">
                Take the questionnaire instead
              </button>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="mb-6 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_10px_30px_-18px_hsl(222_37%_19%/0.3)] focus-within:border-primary/60"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Sparkles className="mb-3 ml-2 size-5 shrink-0 text-primary" />
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Type your answer…"
          aria-label="Your answer"
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] outline-none placeholder:text-foreground/40"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="press grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
    </div>
  );
}
