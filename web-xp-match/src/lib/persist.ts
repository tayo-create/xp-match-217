import { useEffect, useRef, useState } from "react";

/** Fired after any persisted key is written locally (detail: the key). */
export const PERSIST_EVENT = "xp:persist";
/** Fired after cloud sync writes keys into localStorage (detail: the keys) so providers re-read them. */
export const REMOTE_EVENT = "xp:remote";

// Old demo content that early builds wrote into every browser. Stripped wherever it shows up.
const DEMO_IDS: Record<string, Set<string>> = {
  "xp.chats.v1": new Set(["chat-lisbon", "chat-porto", "chat-tokyo"]),
  "xp.trips.v1": new Set(["lisbon", "porto"]),
};

/** Removes leftover demo chats and trips from a stored value. */
export function scrubDemo<T>(key: string, value: T): T {
  const ids = DEMO_IDS[key];
  if (!ids || !Array.isArray(value)) return value;
  return value.filter((x: unknown) => !(x && typeof x === "object" && ids.has(String((x as { id?: unknown }).id ?? "")))) as T;
}

/** Local persistence for provider state. Only used inside context providers. */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const initialRef = useRef<T | (() => T)>(initial);
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return scrubDemo(key, JSON.parse(raw) as T);
    } catch (e) {
      console.warn("[persist] failed to read", key, e);
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent<string>(PERSIST_EVENT, { detail: key }));
    } catch (e) {
      console.warn("[persist] failed to write", key, e);
    }
  }, [key, state]);

  useEffect(() => {
    const onRemote = (e: Event) => {
      const keys = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(keys) && !keys.includes(key)) return;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) setState(scrubDemo(key, JSON.parse(raw) as T));
        else {
          // The key was wiped (sign-out or account switch): fall back to a clean slate.
          const init = initialRef.current;
          setState(typeof init === "function" ? (init as () => T)() : init);
        }
      } catch (err) {
        console.warn("[persist] failed to apply remote", key, err);
      }
    };
    window.addEventListener(REMOTE_EVENT, onRemote);
    return () => window.removeEventListener(REMOTE_EVENT, onRemote);
  }, [key]);

  return [state, setState] as const;
}

export const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Every key that belongs to the user's data. These are cleared on reset and synced to the cloud. */
export const STORAGE_KEYS = [
  "xp.profile.v1",
  "xp.skipped.v1",
  "xp.trips.v1",
  "xp.saved.v1",
  "xp.chats.v1",
  "xp.threads.v1",
  "xp.savedTravelers.v1",
  "xp.reviews.v1",
  "xp.helpful.v1",
  "xp.shares.v1",
  "xp.publicCard.v1",
  "xp.list.v1",
  "xp.listPrefs.v1",
  "xp.wants.v1",
];

/** Wipes every piece of the current person's data from this browser. */
export function clearLocalUserData(): void {
  STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
}
