import { Loader2, Lock, MapPinned, Sparkles, UsersRound } from "lucide-react";

import { AppleMark, GoogleMark } from "@/components/xp/BrandMarks";
import { useAuth } from "@/providers/AuthProvider";

const PERKS = [
  { icon: Sparkles, title: "Picks matched to you", body: "Every suggestion is ranked against your Taste Profile." },
  { icon: MapPinned, title: "Itineraries that build themselves", body: "Name a city and dates, and the trip fills in as we talk." },
  { icon: UsersRound, title: "Private to your account", body: "Your chats and trips are only visible to you and the people you invite." },
];

/** Shown on the concierge when nobody is signed in: chats belong to an account. */
export function ChatSignInGate() {
  const { signIn, isSigningIn, error, clearError, isConfigured } = useAuth();
  return (
    <section className="flex min-h-[calc(100vh-var(--topbar))] items-center justify-center px-4 py-12 sm:px-8" aria-label="Sign in to chat">
      <div className="w-full max-w-[520px] text-center animate-rise">
        <div className="relative mx-auto size-16">
          <div className="grid size-16 place-items-center rounded-full bg-secondary font-display text-2xl font-semibold text-secondary-foreground">XP</div>
          <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <Lock className="size-3.5" />
          </span>
        </div>
        <p className="eyebrow mt-7">Your travel concierge</p>
        <h1 className="mt-3 text-[40px] font-semibold leading-[1.04] text-secondary sm:text-[52px]">Sign in to start planning</h1>
        <p className="mx-auto mt-4 max-w-md text-[17px] text-foreground/70">Each chat is a trip saved to your account, so it's waiting for you on any device.</p>

        {error ? (
          <button type="button" onClick={clearError} className="mx-auto mt-5 block rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
            {error}
          </button>
        ) : null}

        {isConfigured ? (
          <div className="mx-auto mt-8 grid max-w-sm gap-2.5">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void signIn("google")}
              className="press inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl border border-border bg-card text-[15px] font-semibold shadow-sm hover:bg-muted disabled:opacity-60"
            >
              {isSigningIn ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />} Continue with Google
            </button>
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void signIn("apple")}
              className="press inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-secondary text-[15px] font-semibold text-secondary-foreground hover:bg-secondary/90 disabled:opacity-60"
            >
              <AppleMark /> Continue with Apple
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Sign-in isn't available right now. Please try again shortly.</p>
        )}

        <ul className="mt-10 grid gap-2.5 text-left">
          {PERKS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="surface flex items-start gap-3 p-3.5 animate-rise" style={{ animationDelay: `${140 + i * 70}ms` }}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                <Icon className="size-[18px]" />
              </span>
              <span>
                <span className="block text-[14.5px] font-semibold">{title}</span>
                <span className="block text-[13.5px] leading-snug text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
