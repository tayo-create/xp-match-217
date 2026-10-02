import { Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

interface Props {
  title: string;
  body: string;
  className?: string;
}

/** Card asking the visitor to sign in with Google or Apple to continue. */
export function SignInPrompt({ title, body, className }: Props) {
  const { signIn, isSigningIn, error, clearError, isConfigured } = useAuth();
  return (
    <div className={cn("surface p-6 text-center sm:p-8", className)}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
        <Lock className="size-5" />
      </span>
      <h2 className="mt-4 text-[30px] font-semibold leading-tight text-secondary">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-foreground/75">{body}</p>
      {error ? (
        <button type="button" onClick={clearError} className="mx-auto mt-4 block rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
          {error}
        </button>
      ) : null}
      {isConfigured ? (
        <div className="mx-auto mt-6 grid max-w-xs gap-2">
          <button type="button" disabled={isSigningIn} onClick={() => void signIn("google")} className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card font-semibold hover:bg-muted disabled:opacity-60">
            {isSigningIn ? <Loader2 className="size-4 animate-spin" /> : <span className="font-display text-lg font-bold text-[#4285F4]">G</span>} Continue with Google
          </button>
          <button type="button" disabled={isSigningIn} onClick={() => void signIn("apple")} className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary font-semibold text-secondary-foreground hover:bg-secondary/90 disabled:opacity-60">
            Continue with Apple
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Sign-in isn't available right now.</p>
      )}
    </div>
  );
}
