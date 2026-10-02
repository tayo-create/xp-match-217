import { DurableObject } from "cloudflare:workers";

import { MAX_BODY, json, kvDelete, kvGet, kvInit, kvPut, randomToken, readBody, smallObject, str, type Sql } from "./storage";

type Role = "owner" | "editor";

interface MemberRec {
  userId: string;
  name: string;
  avatar: string;
  role: Role;
  joinedAt: number;
  via: "owner" | "invite" | "share";
  profile: Record<string, unknown> | null;
}

interface Meta {
  ownerId: string;
  members: Record<string, MemberRec>;
  removed: Record<string, { name: string; avatar: string; at: number }>;
  createdAt: number;
}

interface Attachment {
  userId: string;
  name: string;
  avatar: string;
}

interface RoomMessage {
  id: string;
  createdAt: number;
  [key: string]: unknown;
}

interface RoomDoc {
  trip: Record<string, unknown> | null;
  messages: RoomMessage[];
  settings: Record<string, unknown> | null;
  title: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
}

type ClientMsg =
  | { type: "update"; trip?: Record<string, unknown>; messages?: RoomMessage[]; settings?: Record<string, unknown>; title?: string }
  | { type: "profile"; profile?: unknown; name?: string; avatar?: string }
  | { type: "ping" };

interface Identity {
  userId: string;
  name: string;
  avatar: string;
  profile: Record<string, unknown> | null;
}

const MAX_MESSAGES = 300;
const TICKET_TTL = 90_000;

const emptyDoc = (): RoomDoc => ({ trip: null, messages: [], settings: null, title: "", version: 0, updatedAt: 0, updatedBy: "" });

const mergeMessages = (base: RoomMessage[], incoming: RoomMessage[]): RoomMessage[] => {
  const byId = new Map<string, RoomMessage>();
  for (const m of base) if (m && typeof m.id === "string") byId.set(m.id, m);
  for (const m of incoming) if (m && typeof m.id === "string") byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)).slice(-MAX_MESSAGES);
};

/**
 * One instance per shared trip. Owns the itinerary, the trip chat, its settings and the member list.
 * Only signed-in members can connect; the owner can remove people, and removed people can't rejoin.
 */
export class TripRoom extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  private doc(): RoomDoc {
    return kvGet<RoomDoc>(this.sql, "doc") ?? emptyDoc();
  }

  private meta(): Meta | null {
    return kvGet<Meta>(this.sql, "meta");
  }

  private saveMeta(meta: Meta): void {
    kvPut(this.sql, "meta", meta);
  }

  private online(exclude?: WebSocket): string[] {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.userId) ids.add(a.userId);
    }
    return [...ids];
  }

  private broadcast(payload: unknown, except?: WebSocket): void {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch (err) {
        console.warn("send failed", err);
      }
    }
  }

  private publicMeta(meta: Meta) {
    return { ownerId: meta.ownerId, members: Object.values(meta.members), removed: Object.entries(meta.removed).map(([userId, r]) => ({ userId, ...r })) };
  }

  private broadcastMeta(meta: Meta, exclude?: WebSocket): void {
    this.broadcast({ type: "meta", meta: this.publicMeta(meta), online: this.online(exclude) }, exclude);
  }

  private identity(request: Request, body: Record<string, unknown> | null): Identity | null {
    const userId = request.headers.get("X-Rork-User-Id");
    if (!userId) return null;
    return {
      userId,
      name: str(body?.name, 40) || str(request.headers.get("X-Rork-User-Name"), 40) || "Traveler",
      avatar: str(body?.avatar, 400),
      profile: smallObject(body?.profile),
    };
  }

  private upsertMember(meta: Meta, who: Identity, role: Role, via: MemberRec["via"]): void {
    const prev = meta.members[who.userId];
    meta.members[who.userId] = {
      userId: who.userId,
      name: who.name,
      avatar: who.avatar || prev?.avatar || "",
      role: prev?.role ?? role,
      joinedAt: prev?.joinedAt ?? Date.now(),
      via: prev?.via ?? via,
      profile: who.profile ?? prev?.profile ?? null,
    };
  }

  /** Disconnects every socket a user holds, telling them why. */
  private kick(userId: string, reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.userId !== userId) continue;
      try {
        ws.send(JSON.stringify({ type: "removed", reason }));
        ws.close(4003, "removed");
      } catch {
        // already closed
      }
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // room, :id, ...rest
    const action = parts[2] ?? "";

    if (request.headers.get("Upgrade") === "websocket") return this.connect(url);

    if (request.method === "GET" && !action) return this.preview(request);

    const body = request.method === "GET" ? null : await readBody<Record<string, unknown>>(request, MAX_BODY);
    const who = this.identity(request, body);
    if (!who) return json({ error: "Sign in to plan this trip together." }, 401);

    if (action === "ticket" && request.method === "POST") return this.ticket(who);
    if (action === "join" && request.method === "POST") return this.join(who);

    const meta = this.meta();
    if (!meta) return json({ error: "This trip invite is no longer active." }, 404);
    const isOwner = meta.ownerId === who.userId;
    const target = parts[3] ?? "";

    if (action === "members" && request.method === "DELETE" && target) {
      const self = target === who.userId || target === "me";
      const uid = self ? who.userId : target;
      if (!self && !isOwner) return json({ error: "Only the trip owner can remove people." }, 403);
      if (uid === meta.ownerId) return json({ error: "The owner can't be removed from their own trip." }, 400);
      const rec = meta.members[uid];
      if (!rec) return json({ error: "That person isn't on this trip." }, 404);
      delete meta.members[uid];
      if (!self) meta.removed[uid] = { name: rec.name, avatar: rec.avatar, at: Date.now() };
      this.saveMeta(meta);
      this.kick(uid, self ? "You left this trip." : "The trip owner removed you from this trip.");
      this.broadcastMeta(meta);
      return json({ ok: true, meta: this.publicMeta(meta) });
    }

    if (action === "members" && request.method === "POST") {
      if (!isOwner) return json({ error: "Only the trip owner can add people." }, 403);
      const uid = str(body?.userId, 128);
      if (!uid) return json({ error: "Missing userId" }, 400);
      delete meta.removed[uid];
      this.upsertMember(meta, { userId: uid, name: str(body?.name, 40) || "Traveler", avatar: str(body?.avatar, 400), profile: null }, "editor", "share");
      this.saveMeta(meta);
      this.broadcastMeta(meta);
      return json({ ok: true, meta: this.publicMeta(meta) });
    }

    if (action === "removed" && request.method === "DELETE" && target) {
      if (!isOwner) return json({ error: "Only the trip owner can do that." }, 403);
      delete meta.removed[target];
      this.saveMeta(meta);
      this.broadcastMeta(meta);
      return json({ ok: true, meta: this.publicMeta(meta) });
    }

    return json({ error: "Not found" }, 404);
  }

  /** Public invite preview: enough to decide whether to join, never the chat itself. */
  private preview(request: Request): Response {
    const doc = this.doc();
    const meta = this.meta();
    if (!doc.trip || !meta) return json({ error: "This trip invite is no longer active." }, 404);
    const t = doc.trip as { city?: string; country?: string; startDate?: string; endDate?: string; cover?: string; days?: { items?: unknown[] }[] };
    const owner = meta.members[meta.ownerId];
    const userId = request.headers.get("X-Rork-User-Id");
    const you = !userId ? "guest" : meta.members[userId] ? "member" : meta.removed[userId] ? "removed" : "none";
    return json({
      preview: {
        title: doc.title,
        city: t.city ?? "",
        country: t.country ?? "",
        startDate: t.startDate ?? "",
        endDate: t.endDate ?? "",
        cover: t.cover ?? "",
        days: Array.isArray(t.days) ? t.days.length : 0,
        stops: Array.isArray(t.days) ? t.days.reduce((n, d) => n + (Array.isArray(d?.items) ? d.items.length : 0), 0) : 0,
      },
      owner: owner ? { name: owner.name, avatar: owner.avatar } : null,
      members: Object.values(meta.members).map((m) => ({ name: m.name, avatar: m.avatar })),
      online: this.online().length,
      you,
    });
  }

  private ticket(who: Identity): Response {
    let meta = this.meta();
    if (!meta) {
      meta = { ownerId: who.userId, members: {}, removed: {}, createdAt: Date.now() };
      this.upsertMember(meta, who, "owner", "owner");
    } else if (meta.removed[who.userId]) {
      return json({ error: "The trip owner removed you from this trip.", code: "removed" }, 403);
    } else if (!meta.members[who.userId]) {
      return json({ error: "Join this trip from its invite link first.", code: "not_member" }, 403);
    } else {
      this.upsertMember(meta, who, "editor", "invite");
    }
    this.saveMeta(meta);
    const ticket = randomToken(32);
    kvPut(this.sql, `ticket:${ticket}`, { userId: who.userId, name: who.name, avatar: who.avatar, exp: Date.now() + TICKET_TTL });
    return json({ ticket, meta: this.publicMeta(meta) });
  }

  private join(who: Identity): Response {
    const meta = this.meta();
    const doc = this.doc();
    if (!meta || !doc.trip) return json({ error: "This trip invite is no longer active." }, 404);
    if (meta.removed[who.userId]) return json({ error: "The trip owner removed you from this trip.", code: "removed" }, 403);
    this.upsertMember(meta, who, "editor", "invite");
    this.saveMeta(meta);
    this.broadcastMeta(meta);
    return json({ doc, meta: this.publicMeta(meta) });
  }

  private connect(url: URL): Response {
    const ticketId = url.searchParams.get("ticket") ?? "";
    const ticket = ticketId ? kvGet<Attachment & { exp: number }>(this.sql, `ticket:${ticketId}`) : null;
    if (ticketId) kvDelete(this.sql, `ticket:${ticketId}`);
    const meta = this.meta();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    if (!ticket || ticket.exp < Date.now() || !meta?.members[ticket.userId]) {
      const removed = Boolean(ticket && meta?.removed[ticket.userId]);
      server.send(JSON.stringify(removed ? { type: "removed", reason: "The trip owner removed you from this trip." } : { type: "error", error: "auth", code: "ticket" }));
      server.close(removed ? 4003 : 4001, "unauthorized");
      return new Response(null, { status: 101, webSocket: client });
    }

    const attachment: Attachment = { userId: ticket.userId, name: ticket.name, avatar: ticket.avatar };
    server.serializeAttachment(attachment);
    const doc = this.doc();
    server.send(JSON.stringify({ type: "welcome", doc: doc.trip ? doc : null, meta: this.publicMeta(meta), online: this.online() }));
    this.broadcast({ type: "presence", online: this.online() }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text.length > MAX_BODY) {
      ws.send(JSON.stringify({ type: "error", error: "Update too large" }));
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      return;
    }
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
    const who = ws.deserializeAttachment() as Attachment | null;
    const meta = this.meta();
    if (!who || !meta?.members[who.userId]) {
      try {
        ws.send(JSON.stringify({ type: "removed", reason: "You're no longer on this trip." }));
        ws.close(4003, "removed");
      } catch {
        // closed
      }
      return;
    }

    if (msg.type === "profile") {
      const rec = meta.members[who.userId];
      rec.profile = smallObject(msg.profile) ?? rec.profile;
      if (str(msg.name, 40)) rec.name = str(msg.name, 40);
      if (str(msg.avatar, 400)) rec.avatar = str(msg.avatar, 400);
      this.saveMeta(meta);
      this.broadcastMeta(meta);
      return;
    }

    if (msg.type !== "update") return;
    const doc = this.doc();
    const next: RoomDoc = {
      trip: msg.trip && typeof msg.trip === "object" ? msg.trip : doc.trip,
      messages: Array.isArray(msg.messages) ? mergeMessages(doc.messages, msg.messages) : doc.messages,
      settings: msg.settings && typeof msg.settings === "object" ? msg.settings : doc.settings,
      title: typeof msg.title === "string" ? msg.title.slice(0, 80) : doc.title,
      version: doc.version + 1,
      updatedAt: Date.now(),
      updatedBy: meta.members[who.userId]?.name ?? who.name,
    };
    if (!next.trip) return;
    kvPut(this.sql, "doc", next);
    this.broadcast({ type: "doc", doc: next, from: who.userId });
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code, "bye");
    } catch {
      // already closed
    }
    this.broadcast({ type: "presence", online: this.online(ws) }, ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.broadcast({ type: "presence", online: this.online(ws) }, ws);
  }
}
