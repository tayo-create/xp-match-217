import { DurableObject } from "cloudflare:workers";

import { json, kvGet, kvInit, kvList, kvPut, readBody, str, type Sql } from "./storage";

interface Dm {
  id: string;
  fromId: string;
  text: string;
  at: number;
}

interface ThreadRec {
  otherId: string;
  otherName: string;
  otherAvatar: string;
  messages: Dm[];
  unread: number;
  updatedAt: number;
}

const MAX_DMS = 400;

/**
 * One instance per user: their direct-message threads. Only the worker entrypoint writes to it
 * (via /internal/deliver), after checking who the sender is.
 */
export class Inbox extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "internal" && parts[1] === "deliver" && request.method === "POST") {
      const body = await readBody<{ otherId?: string; otherName?: string; otherAvatar?: string; dm?: Dm; incoming?: boolean }>(request, 20_000);
      const otherId = str(body?.otherId, 128);
      const dm = body?.dm;
      if (!otherId || !dm || typeof dm.id !== "string" || typeof dm.text !== "string") return json({ error: "Bad delivery" }, 400);
      const key = `t:${otherId}`;
      const prev = kvGet<ThreadRec>(this.sql, key);
      if (prev?.messages.some((m) => m.id === dm.id)) return json({ ok: true });
      const next: ThreadRec = {
        otherId,
        otherName: str(body?.otherName, 40) || prev?.otherName || "Traveler",
        otherAvatar: str(body?.otherAvatar, 400) || prev?.otherAvatar || "",
        messages: [...(prev?.messages ?? []), dm].slice(-MAX_DMS),
        unread: (prev?.unread ?? 0) + (body?.incoming ? 1 : 0),
        updatedAt: dm.at,
      };
      kvPut(this.sql, key, next);
      return json({ ok: true });
    }

    if (parts[0] === "internal" && parts[1] === "purge" && request.method === "POST") {
      this.sql.exec("DELETE FROM kv");
      return json({ ok: true });
    }

    if (parts[0] === "inbox" && parts[1] === "read" && parts[2] && request.method === "POST") {
      const key = `t:${parts[2]}`;
      const prev = kvGet<ThreadRec>(this.sql, key);
      if (prev && prev.unread) kvPut(this.sql, key, { ...prev, unread: 0 });
      return json({ ok: true });
    }

    if (parts[0] === "inbox" && parts.length === 1 && request.method === "GET") {
      const threads = kvList<ThreadRec>(this.sql, "t:", 300).sort((a, b) => b.updatedAt - a.updatedAt);
      return json({ threads });
    }

    return json({ error: "Not found" }, 404);
  }
}
