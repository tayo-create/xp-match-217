import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_KEY = "xp:chunk-reload-at";
const RELOAD_WINDOW_MS = 15_000;

/** True for the errors browsers throw when a code-split file is gone (usually after a new deploy). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|Unable to preload CSS|ChunkLoadError/i.test(message);
}

/**
 * Reloads the page once to pick up the latest build. Returns false if a reload already happened in the
 * last few seconds, so a really missing file can't cause a reload loop.
 */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): still try a single reload.
  }
  window.location.reload();
  return true;
}

/** `React.lazy` that retries once, then reloads to the new build if the file was replaced by a deploy. */
export function lazyRoute<T extends ComponentType<object>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await load();
    } catch (first) {
      if (!isChunkLoadError(first)) throw first;
      try {
        return await load();
      } catch (second) {
        if (reloadForNewBuild()) return new Promise<{ default: T }>(() => undefined);
        throw second;
      }
    }
  });
}

/** Vite fires `vite:preloadError` when a preloaded file is missing; reload instead of failing. */
export function installChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
