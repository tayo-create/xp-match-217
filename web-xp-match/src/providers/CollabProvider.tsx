import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BACKEND_PATH, readJson } from "@/lib/backend";
import { asProfile, publicProfile } from "@/lib/sharedProfile";
import type { ConciergeChat, TasteProfile, Trip } from "@/lib/types";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { type RoomDoc, useConcierge } from "@/providers/ConciergeProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

/** A person on a shared trip, as stored by the room. */
export interface RoomMember {
  userId: string;
  name: string;
  avatar: string;
  role: "owner" | "editor";
  joinedAt: number;
  via: "owner" | "invite" | "share";
  profile: TasteProfile | undefined;
}

export interface RoomMeta {
  ownerId: string;
  members: RoomMember[];
  removed: { userId: string; name: string; avatar: string; at: number }[];
}

interface RawMeta {
  ownerId: string;
  members: (Omit<RoomMember, "profile"> & { profile: unknown })[];
  removed: RoomMeta["removed"];
}

export type RoomStatus = "connecting" | "live" | "offline" | "signin" | "removed";

interface Conn {
  roomId: string;
  chatId: string;
  ws: WebSocket | null;
  ready: boolean;
  closed: boolean;
  retry: number;
  reconnectTimer?: number;
  pingTimer?: number;
  pushTimer?: number;
}

const serialize = (trip: Trip | null | undefined, messages: unknown, settings: unknown, title: string): string =>
  JSON.stringify({ trip: trip ?? null, messages, settings: settings ?? null, title });

const localState = (chat: ConciergeChat, trip: Trip | undefined): string => serialize(trip, chat.messages, chat.settings, chat.title);

const parseMeta = (m: RawMeta): RoomMeta => ({
  ownerId: m.ownerId,
  removed: m.removed ?? [],
  members: (m.members ?? []).map((x) => ({ ...x, profile: asProfile(x.profile, x.name) })).sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.joinedAt - b.joinedAt)),
});

/**
 * Keeps every shared trip chat connected to its live room. Only signed-in members can connect:
 * each connection uses a one-time ticket the room issues after checking the account.
 */
export const [CollabProvider, useCollab] = createContextHook(() => {
  const { chats, applyRoomDoc, leaveRoom } = useConcierge();
  const { tripById, me } = useTrips();
  const { profile } = useProfile();
  const { user } = useAuth();
  const [metas, setMetas] = useState<Record<string, RoomMeta>>({});
  const [online, setOnline] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<Record<string, RoomStatus>>({});
  const [lastRemote, setLastRemote] = useState<Record<string, { by: string; at: number }>>({});
  const conns = useRef<Map<string, Conn>>(new Map());
  const synced = useRef<Map<string, string>>(new Map());
  const userId = user?.id;

  const chatsRef = useRef<ConciergeChat[]>(chats);
  chatsRef.current = chats;
  const tripByIdRef = useRef(tripById);
  tripByIdRef.current = tripById;
  const applyRef = useRef(applyRoomDoc);
  applyRef.current = applyRoomDoc;
  const leaveRef = useRef(leaveRoom);
  leaveRef.current = leaveRoom;
  const identity = useRef({ name: me.label, avatar: user?.picture ?? "", profile: publicProfile(profile) });
  identity.current = { name: me.label, avatar: user?.picture ?? "", profile: publicProfile(profile) };

  const setRoomStatus = (roomId: string, s: RoomStatus) => setStatus((prev) => (prev[roomId] === s ? prev : { ...prev, [roomId]: s }));

  const sendState = useCallback((conn: Conn) => {
    const chat = chatsRef.current.find((c) => c.id === conn.chatId);
    const trip = tripByIdRef.current(chat?.tripId);
    if (!chat || !trip || conn.ws?.readyState !== WebSocket.OPEN) return;
    synced.current.set(conn.roomId, localState(chat, trip));
    conn.ws.send(JSON.stringify({ type: "update", trip, messages: chat.messages, settings: chat.settings ?? null, title: chat.title }));
  }, []);

  const dropConn = useCallback((roomId: string) => {
    const conn = conns.current.get(roomId);
    if (!conn) return;
    conn.closed = true;
    window.clearTimeout(conn.reconnectTimer);
    window.clearInterval(conn.pingTimer);
    window.clearTimeout(conn.pushTimer);
    conn.ws?.close();
    conns.current.delete(roomId);
    synced.current.delete(roomId);
  }, []);

  const onRemoved = useCallback(
    (conn: Conn, reason: string) => {
      setRoomStatus(conn.roomId, "removed");
      dropConn(conn.roomId);
      leaveRef.current(conn.chatId);
      toast(reason, { description: "Your copy of the trip stays on this device." });
    },
    [dropConn],
  );

  const connect = useCallback(
    async (conn: Conn) => {
      if (conn.closed) return;
      setRoomStatus(conn.roomId, "connecting");
      let ticket: string;
      try {
        const res = await fetchWithAuth(`${BACKEND_PATH}/room/${conn.roomId}/ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(identity.current),
        });
        if (res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          if (body.code === "removed") onRemoved(conn, body.error ?? "You were removed from this trip.");
          else {
            setRoomStatus(conn.roomId, "removed");
            dropConn(conn.roomId);
          }
          return;
        }
        if (res.status === 401) {
          setRoomStatus(conn.roomId, "signin");
          return;
        }
        const data = await readJson<{ ticket: string; meta: RawMeta }>(res);
        ticket = data.ticket;
        setMetas((m) => ({ ...m, [conn.roomId]: parseMeta(data.meta) }));
      } catch (e) {
        console.warn("[collab] ticket failed", e instanceof Error ? e.message : e);
        setRoomStatus(conn.roomId, "offline");
        const delay = Math.min(20_000, 1500 * 2 ** conn.retry);
        conn.retry += 1;
        conn.reconnectTimer = window.setTimeout(() => void connect(conn), delay);
        return;
      }
      if (conn.closed) return;

      const url = new URL(`${BACKEND_PATH}/room/${conn.roomId}/ws`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", ticket);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        console.warn("[collab] socket failed", e instanceof Error ? e.message : e);
        setRoomStatus(conn.roomId, "offline");
        return;
      }
      conn.ws = ws;

      ws.onopen = () => {
        conn.retry = 0;
        window.clearInterval(conn.pingTimer);
        conn.pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };

      ws.onmessage = (event) => {
        let msg: { type: string; doc?: RoomDoc | null; meta?: RawMeta; online?: string[]; from?: string; error?: string; reason?: string };
        try {
          msg = JSON.parse(String(event.data)) as typeof msg;
        } catch {
          return;
        }
        if (msg.meta) setMetas((m) => ({ ...m, [conn.roomId]: parseMeta(msg.meta as RawMeta) }));
        if (msg.online) setOnline((o) => ({ ...o, [conn.roomId]: msg.online ?? [] }));
        if (msg.type === "welcome") {
          conn.ready = true;
          setRoomStatus(conn.roomId, "live");
          if (msg.doc?.trip) {
            synced.current.set(conn.roomId, serialize(msg.doc.trip, msg.doc.messages, msg.doc.settings, msg.doc.title));
            applyRef.current(conn.chatId, msg.doc);
          } else sendState(conn);
        } else if (msg.type === "doc" && msg.doc?.trip) {
          if (msg.from === userId) return;
          synced.current.set(conn.roomId, serialize(msg.doc.trip, msg.doc.messages, msg.doc.settings, msg.doc.title));
          applyRef.current(conn.chatId, msg.doc);
          setLastRemote((r) => ({ ...r, [conn.roomId]: { by: msg.doc?.updatedBy ?? "Someone", at: Date.now() } }));
        } else if (msg.type === "removed") {
          onRemoved(conn, msg.reason ?? "You were removed from this trip.");
        } else if (msg.type === "error") {
          console.warn("[collab] room error", msg.error);
        }
      };

      ws.onclose = () => {
        window.clearInterval(conn.pingTimer);
        conn.ready = false;
        if (conn.closed) return;
        setRoomStatus(conn.roomId, "offline");
        const delay = Math.min(15_000, 1000 * 2 ** conn.retry);
        conn.retry += 1;
        conn.reconnectTimer = window.setTimeout(() => void connect(conn), delay);
      };
    },
    [sendState, userId, onRemoved, dropConn],
  );

  const roomKey = useMemo(
    () =>
      chats
        .filter((c) => c.roomId)
        .map((c) => `${c.roomId}:${c.id}`)
        .sort()
        .join("|"),
    [chats],
  );

  useEffect(() => {
    const wanted = new Map<string, string>();
    if (userId) {
      roomKey
        .split("|")
        .filter(Boolean)
        .forEach((pair) => {
          const [roomId, chatId] = pair.split(":");
          wanted.set(roomId, chatId);
        });
    } else {
      roomKey
        .split("|")
        .filter(Boolean)
        .forEach((pair) => setRoomStatus(pair.split(":")[0], "signin"));
    }
    for (const [roomId, conn] of conns.current) {
      if (wanted.get(roomId) !== conn.chatId) dropConn(roomId);
    }
    for (const [roomId, chatId] of wanted) {
      if (conns.current.has(roomId)) continue;
      const conn: Conn = { roomId, chatId, ws: null, ready: false, closed: false, retry: 0 };
      conns.current.set(roomId, conn);
      void connect(conn);
    }
  }, [roomKey, connect, userId, dropConn]);

  useEffect(
    () => () => {
      for (const roomId of [...conns.current.keys()]) dropConn(roomId);
    },
    [dropConn],
  );

  // Push local edits (debounced) whenever this device changes a shared chat or its trip.
  useEffect(() => {
    for (const conn of conns.current.values()) {
      if (!conn.ready) continue;
      const chat = chats.find((c) => c.id === conn.chatId);
      const trip = tripById(chat?.tripId);
      if (!chat || !trip) continue;
      if (localState(chat, trip) === synced.current.get(conn.roomId)) continue;
      window.clearTimeout(conn.pushTimer);
      conn.pushTimer = window.setTimeout(() => sendState(conn), 350);
    }
  }, [chats, tripById, sendState]);

  // Share my latest Taste Profile with trip mates so group scores stay accurate.
  const profileKey = JSON.stringify(identity.current);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const conn of conns.current.values()) {
        if (conn.ready && conn.ws?.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify({ type: "profile", ...identity.current }));
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [profileKey]);

  const roomAction = useCallback(async (roomId: string, path: string, method: string, body?: unknown): Promise<RoomMeta> => {
    const res = await fetchWithAuth(`${BACKEND_PATH}/room/${roomId}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const { meta } = await readJson<{ meta: RawMeta }>(res);
    const parsed = parseMeta(meta);
    setMetas((m) => ({ ...m, [roomId]: parsed }));
    return parsed;
  }, []);

  /** Owner only: removes someone from the trip. They're disconnected and can't rejoin. */
  const removeMember = useCallback((roomId: string, uid: string) => roomAction(roomId, `members/${encodeURIComponent(uid)}`, "DELETE"), [roomAction]);
  /** Owner only: lets a removed person join again with the invite link. */
  const allowBack = useCallback((roomId: string, uid: string) => roomAction(roomId, `removed/${encodeURIComponent(uid)}`, "DELETE"), [roomAction]);
  /** Owner only: adds someone directly (used when granting edit access from a public link). */
  const addMember = useCallback((roomId: string, person: { userId: string; name: string; avatar: string }) => roomAction(roomId, "members", "POST", person), [roomAction]);

  /** Makes sure the room exists with me as owner (first ticket creates it). */
  const ensureRoom = useCallback(
    async (roomId: string) => {
      const res = await fetchWithAuth(`${BACKEND_PATH}/room/${roomId}/ticket`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identity.current) });
      const { meta } = await readJson<{ meta: RawMeta }>(res);
      const parsed = parseMeta(meta);
      setMetas((m) => ({ ...m, [roomId]: parsed }));
      return parsed;
    },
    [],
  );

  /** Leaves a shared trip for good (members) and stops syncing it here. */
  const leaveTrip = useCallback(
    async (chatId: string, roomId: string) => {
      try {
        await roomAction(roomId, "members/me", "DELETE");
      } catch (e) {
        console.warn("[collab] leave failed", e instanceof Error ? e.message : e);
      }
      dropConn(roomId);
      leaveRef.current(chatId);
    },
    [roomAction, dropConn],
  );

  const metaFor = useCallback((roomId: string | undefined): RoomMeta | undefined => (roomId ? metas[roomId] : undefined), [metas]);
  const onlineFor = useCallback((roomId: string | undefined): string[] => (roomId ? (online[roomId] ?? []) : []), [online]);
  const statusFor = useCallback((roomId: string | undefined): RoomStatus | undefined => (roomId ? status[roomId] : undefined), [status]);
  const lastRemoteFor = useCallback((roomId: string | undefined) => (roomId ? lastRemote[roomId] : undefined), [lastRemote]);
  const isOwner = useCallback((roomId: string | undefined) => Boolean(roomId && userId && metas[roomId]?.ownerId === userId), [metas, userId]);

  return { metaFor, onlineFor, statusFor, lastRemoteFor, isOwner, removeMember, allowBack, addMember, ensureRoom, leaveTrip, myId: me.id };
});
