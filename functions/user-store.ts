import { DurableObject } from "cloudflare:workers";

import { MAX_BODY, json, kvDelete, kvGet, kvInit, kvPut, type Sql } from "./storage";

interface Stored {
  data: Record<string, unknown>;
  updatedAt: number;
}

/** One instance per signed-in user: holds their synced profile, trips, chats and messages. */
export class UserStore extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      const stored = kvGet<Stored>(this.sql, "snapshot");
      return json({ data: stored?.data ?? null, updatedAt: stored?.updatedAt ?? 0 });
    }

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: "Your data is too large to sync." }, 413);
      let body: { data?: unknown };
      try {
        body = JSON.parse(text) as { data?: unknown };
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return json({ error: "Missing data" }, 400);
      const updatedAt = Date.now();
      kvPut(this.sql, "snapshot", { data: body.data, updatedAt } satisfies Stored);
      return json({ updatedAt });
    }

    if (request.method === "DELETE") {
      kvDelete(this.sql, "snapshot");
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  }
}
