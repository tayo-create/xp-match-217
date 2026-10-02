import { DurableObject } from "cloudflare:workers";

import { MAX_BODY, json, kvDelete, kvGet, kvInit, kvPut, readBody, str, type Sql } from "./storage";

interface Published {
  key: string;
  trip: Record<string, unknown>;
  owner: string;
  publishedAt: number;
}

type AccessStatus = "pending" | "granted" | "denied";

interface AccessRec {
  userId: string;
  name: string;
  avatar: string;
  note: string;
  status: AccessStatus;
  at: number;
  roomId?: string;
}

/**
 * A public, view-only snapshot of one itinerary. Anyone can view; only the owner (holder of the key)
 * can update it. Signed-in visitors can ask for edit access, and the owner grants it per person.
 */
export class SharedTrip extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  private access(): Record<string, AccessRec> {
    return kvGet<Record<string, AccessRec>>(this.sql, "access") ?? {};
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").filter(Boolean)[2] ?? "";
    const stored = kvGet<Published>(this.sql, "published");
    const userId = request.headers.get("X-Rork-User-Id");

    if (request.method === "GET" && !action) {
      if (!stored) return json({ error: "This shared itinerary doesn't exist or was unshared." }, 404);
      const mine = userId ? this.access()[userId] : undefined;
      return json({
        trip: stored.trip,
        owner: stored.owner,
        publishedAt: stored.publishedAt,
        mode: "view",
        you: userId ? { status: mine?.status ?? "none", roomId: mine?.status === "granted" ? mine.roomId : undefined } : { status: "guest" },
      });
    }

    const body = await readBody<Record<string, unknown>>(request, MAX_BODY);

    if (action === "request" && request.method === "POST") {
      if (!stored) return json({ error: "This shared itinerary was unshared." }, 404);
      if (!userId) return json({ error: "Sign in to ask for edit access." }, 401);
      const access = this.access();
      const prev = access[userId];
      if (prev?.status === "granted") return json({ status: "granted", roomId: prev.roomId });
      access[userId] = {
        userId,
        name: str(body?.name, 40) || str(request.headers.get("X-Rork-User-Name"), 40) || "Traveler",
        avatar: str(body?.avatar, 400),
        note: str(body?.note, 200),
        status: "pending",
        at: Date.now(),
      };
      kvPut(this.sql, "access", access);
      return json({ status: "pending" });
    }

    if (!body) return json({ error: "Invalid JSON" }, 400);
    const key = str(body.key, 64);
    if (key.length < 16) return json({ error: "Missing key" }, 400);
    if (stored && stored.key !== key) return json({ error: "Not allowed" }, 403);

    if (action === "admin" && request.method === "POST") {
      if (!stored) return json({ error: "Not shared" }, 404);
      const access = this.access();
      const op = str(body.op, 16);
      const target = str(body.userId, 128);
      if (op !== "list") {
        const rec = access[target];
        if (!rec) return json({ error: "No request from that person." }, 404);
        if (op === "grant") {
          rec.status = "granted";
          rec.roomId = str(body.roomId, 64) || rec.roomId;
        } else if (op === "deny" || op === "revoke") {
          rec.status = "denied";
          rec.roomId = undefined;
        } else if (op === "forget") {
          delete access[target];
        } else return json({ error: "Unknown op" }, 400);
        rec.at = Date.now();
        kvPut(this.sql, "access", access);
      }
      return json({ requests: Object.values(access).sort((a, b) => b.at - a.at) });
    }

    if (request.method === "PUT" && !action) {
      if (!body.trip || typeof body.trip !== "object") return json({ error: "Missing trip" }, 400);
      const publishedAt = Date.now();
      kvPut(this.sql, "published", {
        key,
        trip: body.trip as Record<string, unknown>,
        owner: str(body.owner, 60) || "A traveler",
        publishedAt,
      } satisfies Published);
      const pending = Object.values(this.access()).filter((r) => r.status === "pending").length;
      return json({ ok: true, publishedAt, pending });
    }

    if (request.method === "DELETE" && !action) {
      kvDelete(this.sql, "published");
      kvDelete(this.sql, "access");
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  }
}
