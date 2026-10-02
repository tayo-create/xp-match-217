import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";

import { BACKEND_PATH, readJson } from "@/lib/backend";
import { PERSIST_EVENT, REMOTE_EVENT, STORAGE_KEYS, clearLocalUserData } from "@/lib/persist";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";

const META_KEY = "xp.syncmeta.v1";

type Snapshot = Record<string, unknown>;
type SyncStatus = "off" | "syncing" | "synced" | "offline";

interface Meta {
  userId: string;
  syncedAt: number;
}

const readMeta = (): Meta | null => {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as Meta) : null;
  } catch {
    return null;
  }
};

const writeMeta = (m: Meta | null): void => {
  if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
  else localStorage.removeItem(META_KEY);
};

const takeSnapshot = (): Snapshot => {
  const out: Snapshot = {};
  for (const k of STORAGE_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    try {
      out[k] = JSON.parse(raw);
    } catch {
      // skip unreadable keys
    }
  }
  return out;
};

const keyOf = (x: unknown): string => {
  if (x && typeof x === "object") {
    const o = x as { id?: unknown; travelerId?: unknown };
    if (typeof o.id === "string") return o.id;
    if (typeof o.travelerId === "string") return o.travelerId;
  }
  return JSON.stringify(x);
};

/** Union of two copies of the user's data: lists merge by id (cloud copy wins on conflicts). */
const mergeSnapshots = (local: Snapshot, remote: Snapshot): Snapshot => {
  const out: Snapshot = { ...local };
  for (const [k, rv] of Object.entries(remote)) {
    const lv = local[k];
    if (Array.isArray(lv) && Array.isArray(rv)) {
      const map = new Map<string, unknown>();
      lv.forEach((x) => map.set(keyOf(x), x));
      rv.forEach((x) => map.set(keyOf(x), x));
      out[k] = [...map.values()];
    } else if (lv && rv && typeof lv === "object" && typeof rv === "object" && !Array.isArray(lv)) {
      out[k] = { ...(lv as object), ...(rv as object) };
    } else {
      out[k] = rv ?? lv;
    }
  }
  return out;
};

const applySnapshot = (snap: Snapshot): void => {
  const keys = Object.keys(snap).filter((k) => STORAGE_KEYS.includes(k));
  keys.forEach((k) => localStorage.setItem(k, JSON.stringify(snap[k])));
  window.dispatchEvent(new CustomEvent<string[]>(REMOTE_EVENT, { detail: keys }));
};

/** Empties this browser's copy of the user's data and tells every provider to reset. */
const wipeLocal = (): void => {
  clearLocalUserData();
  window.dispatchEvent(new CustomEvent<string[]>(REMOTE_EVENT, { detail: STORAGE_KEYS }));
};

/**
 * Keeps the user's profile, trips, chats and messages in sync with their cloud account.
 * Each account's data lives in its own cloud store; this browser only ever holds one account at a time.
 */
export const [SyncProvider, useSync] = createContextHook(() => {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<SyncStatus>("off");
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const [readyFor, setReadyFor] = useState<string>("");
  const lastSent = useRef<string>("");
  const busy = useRef<boolean>(false);
  const userId = user?.id;

  const push = useCallback(async () => {
    if (!userId) return;
    const snap = takeSnapshot();
    const str = JSON.stringify(snap);
    if (str === lastSent.current) return;
    setStatus("syncing");
    try {
      const res = await fetchWithAuth(`${BACKEND_PATH}/sync`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: snap }) });
      const { updatedAt } = await readJson<{ updatedAt: number }>(res);
      lastSent.current = str;
      writeMeta({ userId, syncedAt: updatedAt });
      setLastSyncedAt(updatedAt);
      setStatus("synced");
    } catch (e) {
      console.warn("[sync] push failed", e instanceof Error ? e.message : e);
      setStatus("offline");
    }
  }, [userId]);

  const pull = useCallback(async () => {
    if (!userId || busy.current) return;
    busy.current = true;
    setStatus("syncing");
    try {
      const res = await fetchWithAuth(`${BACKEND_PATH}/sync`);
      const { data, updatedAt } = await readJson<{ data: Snapshot | null; updatedAt: number }>(res);
      const meta = readMeta();
      const local = takeSnapshot();
      const localStr = JSON.stringify(local);
      const firstLink = meta?.userId !== userId;
      const dirty = lastSent.current !== "" && localStr !== lastSent.current;

      if (data && (firstLink || updatedAt > (meta?.syncedAt ?? 0))) {
        const next = firstLink || dirty ? mergeSnapshots(local, data) : data;
        applySnapshot(next);
        const nextStr = JSON.stringify(takeSnapshot());
        writeMeta({ userId, syncedAt: updatedAt });
        setLastSyncedAt(updatedAt);
        if (nextStr !== JSON.stringify(data)) {
          lastSent.current = "";
          await push();
        } else {
          lastSent.current = nextStr;
          setStatus("synced");
        }
      } else if (!data || localStr !== lastSent.current) {
        if (data && lastSent.current === "" && !firstLink) lastSent.current = JSON.stringify(data);
        await push();
        setStatus("synced");
      } else {
        setStatus("synced");
      }
    } catch (e) {
      console.warn("[sync] pull failed", e instanceof Error ? e.message : e);
      setStatus("offline");
    } finally {
      busy.current = false;
      setReadyFor(userId);
    }
  }, [userId, push]);

  useEffect(() => {
    if (!userId) {
      setStatus("off");
      lastSent.current = "";
      return;
    }
    // A different account signed in on this browser: drop the previous person's data before loading theirs.
    const meta = readMeta();
    if (meta && meta.userId !== userId) {
      wipeLocal();
      writeMeta(null);
      lastSent.current = "";
    }
    void pull();
  }, [userId, pull]);

  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const onLocal = () => {
      if (busy.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), 1500);
    };
    let lastPull = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastPull < 10_000) return;
      lastPull = Date.now();
      void pull();
    };
    const interval = window.setInterval(onFocus, 45_000);
    window.addEventListener(PERSIST_EVENT, onLocal);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener(PERSIST_EVENT, onLocal);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId, push, pull]);

  const forgetDevice = useCallback(() => writeMeta(null), []);

  /** Signs out and removes this account's data from the browser. It stays safe in the cloud for next sign-in. */
  const signOutAndClear = useCallback(async () => {
    try {
      await push();
    } catch {
      // best effort: data that never synced stays lost only if the network is down
    }
    signOut();
    writeMeta(null);
    wipeLocal();
    window.location.assign("/");
  }, [push, signOut]);

  /** True once this account's cloud copy has been loaded (or there's no account). */
  const isReady = !userId || readyFor === userId;

  return { status, lastSyncedAt, isReady, syncNow: pull, forgetDevice, signOutAndClear };
});
