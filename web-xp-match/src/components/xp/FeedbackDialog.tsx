import createContextHook from "@nkzw/create-context-hook";
import { Bug, Check, Lightbulb, Loader2, MessageSquareHeart, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_VERSION, type FeedbackKind, sendFeedback } from "@/lib/beta";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";

/** Lets any screen open the feedback form. */
export const [FeedbackProvider, useFeedback] = createContextHook(() => {
  const [open, setOpen] = useState<boolean>(false);
  const [kind, setKind] = useState<Exclude<FeedbackKind, "crash">>("bug");
  const openFeedback = useCallback((k: Exclude<FeedbackKind, "crash"> = "bug") => {
    setKind(k);
    setOpen(true);
  }, []);
  return { open, setOpen, kind, setKind, openFeedback };
});

const KINDS: { id: Exclude<FeedbackKind, "crash">; label: string; icon: typeof Bug; hint: string }[] = [
  { id: "bug", label: "Something's broken", icon: Bug, hint: "What did you do, what happened, and what did you expect?" },
  { id: "idea", label: "I have an idea", icon: Lightbulb, hint: "What would make XP Match more useful for your trips?" },
  { id: "other", label: "Just a thought", icon: MessageSquareHeart, hint: "Anything you loved, hated or found confusing." },
];

/** The beta feedback form. Attaches the page, browser and app version automatically. */
export function FeedbackDialog() {
  const { open, setOpen, kind, setKind } = useFeedback();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [message, setMessage] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);
  const meta = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  const submit = async () => {
    if (message.trim().length < 3) return toast("Add a few words first");
    setBusy(true);
    try {
      await sendFeedback({ kind, message: message.trim(), email: user?.email || email.trim() || undefined, name: profile.name });
      setSent(true);
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send feedback.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) window.setTimeout(() => setSent(false), 200);
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-lg">
        {sent ? (
          <div className="py-6 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-6" />
            </span>
            <DialogTitle className="mt-4 font-display text-[32px] font-semibold text-secondary">Thank you</DialogTitle>
            <DialogDescription className="mx-auto mt-1 max-w-xs">Every note from beta testers gets read. It shapes what we build next.</DialogDescription>
            <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm font-semibold text-primary hover:underline">
              Send another
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <p className="eyebrow">Beta feedback</p>
              <DialogTitle className="font-display text-[32px] font-semibold leading-tight text-secondary">Tell us how it's going</DialogTitle>
              <DialogDescription>Goes straight to the XP Match team.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={cn("press flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[12.5px] font-semibold leading-tight", kind === k.id ? "border-primary bg-accent/70 text-primary" : "border-border hover:bg-muted")}
                >
                  <k.icon className="size-5" />
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={3000}
              autoFocus
              placeholder={meta.hint}
              aria-label="Your feedback"
              className="w-full rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
            />
            {!user ? (
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={120} placeholder="Email, if you'd like a reply (optional)" aria-label="Email" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary/60" />
            ) : null}
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">We include this page, your browser and version {APP_VERSION}. No trip data.</p>
              <button type="button" onClick={() => void submit()} disabled={busy} className="press inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
