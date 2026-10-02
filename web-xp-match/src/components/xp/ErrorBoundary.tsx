import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportCrash } from "@/lib/beta";

interface State {
  error: Error | null;
}

/** Catches render crashes, reports them to the beta inbox, and offers a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[xp] render crash", error.message);
    reportCrash(error, "render", { componentStack: info.componentStack?.split("\n").slice(0, 8).join("\n") });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="eyebrow">Something broke</p>
          <h1 className="mt-3 font-display text-5xl font-semibold text-secondary">We took a wrong turn</h1>
          <p className="mt-3 text-lg text-muted-foreground">This page hit an error. We've sent a report automatically, and your trips and ratings are safe on this device.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="press inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
              Reload
            </button>
            <button type="button" onClick={() => window.location.assign("/")} className="press inline-flex h-12 items-center rounded-xl border border-border bg-card px-6 font-semibold hover:bg-muted">
              Back to the concierge
            </button>
          </div>
        </div>
      </div>
    );
  }
}
