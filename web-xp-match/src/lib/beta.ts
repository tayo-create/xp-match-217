import { BACKEND_PATH, getClientId } from "@/lib/backend";
import { fetchWithAuth } from "@/providers/AuthProvider";

/** Shown to testers and attached to every report. Bump when shipping a new beta build. */
export const APP_VERSION = "0.9.0-beta.1";

export type FeedbackKind = "bug" | "idea" | "other" | "crash";

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  email?: string;
  name?: string;
  context?: Record<string, unknown>;
}

const envInfo = () => ({
  page: `${window.location.pathname}${window.location.search}`.slice(0, 200),
  version: APP_VERSION,
  ua: navigator.userAgent.slice(0, 300),
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  clientId: getClientId(),
});

/** Sends tester feedback (or a crash report) to the beta inbox. */
export async function sendFeedback(input: FeedbackInput): Promise<void> {
  const res = await fetchWithAuth(`${BACKEND_PATH}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, ...envInfo() }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Couldn't send feedback. Try again in a moment.");
  }
}

// Crash reporting: one report per distinct error per session, and never more than 10.
const sent = new Set<string>();
const IGNORE = [/ResizeObserver loop/i, /Script error\.?$/i, /Loading chunk .* failed/i, /dynamically imported module/i, /Importing a module script failed/i, /Unable to preload CSS/i, /AbortError/i, /NetworkError when attempting/i];

/** Reports an unexpected error. Safe to call from anywhere; it never throws. */
export function reportCrash(error: unknown, where: string, extra?: Record<string, unknown>): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error)?.slice(0, 300) ?? "Unknown error");
    const head = `${err.name}: ${err.message}`.slice(0, 400);
    if (IGNORE.some((r) => r.test(head)) || sent.has(head) || sent.size >= 10) return;
    sent.add(head);
    const stack = (err.stack ?? "").split("\n").slice(0, 14).join("\n").slice(0, 3000);
    void sendFeedback({ kind: "crash", message: `${head}\n${stack}`, context: { where, ...extra } }).catch(() => undefined);
  } catch {
    // never let crash reporting crash
  }
}

let installed = false;

/** Catches uncaught errors and unhandled promise rejections in production builds. */
export function installCrashReporting(): void {
  if (installed || import.meta.env.DEV) return;
  installed = true;
  window.addEventListener("error", (e) => reportCrash(e.error ?? e.message, "window.onerror", { src: e.filename ? `${e.filename}:${e.lineno}` : undefined }));
  window.addEventListener("unhandledrejection", (e) => reportCrash(e.reason, "unhandledrejection"));
}
