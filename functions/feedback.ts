import { DurableObject } from "cloudflare:workers";

import { json, kvDelete, kvGet, kvInit, kvList, kvPut, randomToken, readBody, smallObject, str, type Sql } from "./storage";

type Kind = "bug" | "idea" | "other" | "crash" | "report";

/** One piece of beta feedback, an automatic crash report, or a reported feed post. */
interface Entry {
  id: string;
  kind: Kind;
  message: string;
  page: string;
  version: string;
  ua: string;
  viewport: string;
  userId: string;
  name: string;
  email: string;
  clientId: string;
  context?: Record<string, unknown>;
  /** For crashes: how many times the same error was seen. */
  count: number;
  /** For reports: the reported post. */
  postId?: string;
  resolved: boolean;
  createdAt: number;
  lastSeenAt: number;
}

interface Owner {
  userId: string;
  claimedAt: number;
}

const KINDS: Kind[] = ["bug", "idea", "other", "crash"];
const MAX_ENTRIES = 3000;
const RATE_WINDOW = 60 * 60_000;
const RATE_MAX = 40;

const hash = (s: string): string => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/**
 * Single global instance: the beta inbox. Testers send feedback, the app sends crash reports,
 * and reported feed posts land here. The first signed-in person to claim it becomes the admin.
 */
export class Feedback extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  private owner(): Owner | null {
    return kvGet<Owner>(this.sql, "owner");
  }

  private isAdmin(userId: string | null): boolean {
    const o = this.owner();
    return Boolean(userId && o && o.userId === userId);
  }

  private limited(key: string): boolean {
    const now = Date.now();
    const rec = kvGet<{ start: number; n: number }>(this.sql, `rl:${key}`);
    const next = !rec || now - rec.start > RATE_WINDOW ? { start: now, n: 1 } : { start: rec.start, n: rec.n + 1 };
    kvPut(this.sql, `rl:${key}`, next);
    return next.n > RATE_MAX;
  }

  private trim(): void {
    const all = kvList<Entry>(this.sql, "e:", MAX_ENTRIES + 100);
    if (all.length <= MAX_ENTRIES) return;
    all.sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(MAX_ENTRIES).forEach((e) => kvDelete(this.sql, `e:${e.id}`));
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const m = request.method;
    const userId = request.headers.get("X-Rork-User-Id");

    // Internal: reported posts (from the worker) and admin checks.
    if (parts[0] === "internal") {
      if (parts[1] === "is-admin") return json({ admin: this.isAdmin(url.searchParams.get("u")) });
      if (parts[1] === "report" && m === "POST") {
        const body = await readBody<Record<string, unknown>>(request, 8_000);
        const postId = str(body?.postId, 64);
        if (!postId) return json({ error: "Missing post" }, 400);
        const id = `rep-${postId}`;
        const now = Date.now();
        const old = kvGet<Entry>(this.sql, `e:${id}`);
        const reason = str(body?.reason, 300);
        const entry: Entry = {
          id,
          kind: "report",
          message: (old ? `${old.message}\n${reason}` : `"${str(body?.title, 120)}" by ${str(body?.owner, 40)}\n${reason}`).slice(0, 2000),
          page: "/feed",
          version: "",
          ua: "",
          viewport: "",
          userId: str(body?.reporter, 128),
          name: "",
          email: "",
          clientId: "",
          context: { hidden: body?.hidden === true, reports: typeof body?.reports === "number" ? body.reports : 1 },
          count: (old?.count ?? 0) + 1,
          postId,
          resolved: false,
          createdAt: old?.createdAt ?? now,
          lastSeenAt: now,
        };
        kvPut(this.sql, `e:${id}`, entry);
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    }

    // Anyone using the beta can send feedback; signed-in testers are attributed.
    if (parts[0] === "feedback" && parts.length === 1 && m === "POST") {
      const body = await readBody<Record<string, unknown>>(request, 40_000);
      if (!body) return json({ error: "That message is too long." }, 413);
      const kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : "other";
      const message = str(body.message, kind === "crash" ? 4000 : 3000);
      if (!message) return json({ error: "Write a few words first." }, 400);
      const clientId = str(body.clientId, 64) || "anon";
      if (this.limited(userId ?? clientId)) return json({ error: "Thanks! You've sent a lot of feedback this hour. Try again later." }, 429);

      const now = Date.now();
      // Identical crashes from the same build collapse into one entry with a count.
      const id = kind === "crash" ? `crash-${hash(`${str(body.version, 30)}|${message.split("\n").slice(0, 3).join("|")}`)}` : `fb-${now.toString(36)}-${randomToken(6)}`;
      const old = kind === "crash" ? kvGet<Entry>(this.sql, `e:${id}`) : null;
      const entry: Entry = {
        id,
        kind,
        message,
        page: str(body.page, 200),
        version: str(body.version, 30),
        ua: str(body.ua, 300),
        viewport: str(body.viewport, 30),
        userId: userId ?? "",
        name: str(body.name, 60) || str(request.headers.get("X-Rork-User-Name"), 60),
        email: str(body.email, 120),
        clientId,
        context: smallObject(body.context, 8_000) ?? undefined,
        count: (old?.count ?? 0) + 1,
        resolved: false,
        createdAt: old?.createdAt ?? now,
        lastSeenAt: now,
      };
      kvPut(this.sql, `e:${id}`, entry);
      this.trim();
      return json({ ok: true, id });
    }

    if (parts[0] !== "beta") return json({ error: "Not found" }, 404);
    if (!userId) return json({ error: "Sign in to open the beta dashboard." }, 401);

    if (parts[1] === "me" && m === "GET") {
      const o = this.owner();
      return json({ admin: this.isAdmin(userId), claimable: !o });
    }

    if (parts[1] === "claim" && m === "POST") {
      const o = this.owner();
      if (o && o.userId !== userId) return json({ error: "This beta already has an admin." }, 403);
      if (!o) kvPut(this.sql, "owner", { userId, claimedAt: Date.now() } satisfies Owner);
      return json({ admin: true });
    }

    if (!this.isAdmin(userId)) return json({ error: "Only the beta admin can see this." }, 403);

    if (parts[1] === "feedback" && parts.length === 2 && m === "GET") {
      const entries = kvList<Entry>(this.sql, "e:", MAX_ENTRIES + 100).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      return json({ entries });
    }

    if (parts[1] === "feedback" && parts[2]) {
      const entry = kvGet<Entry>(this.sql, `e:${parts[2]}`);
      if (!entry) return json({ error: "Already removed." }, 404);
      if (parts[3] === "resolve" && m === "POST") {
        const next = { ...entry, resolved: !entry.resolved };
        kvPut(this.sql, `e:${entry.id}`, next);
        return json({ entry: next });
      }
      if (parts.length === 3 && m === "DELETE") {
        kvDelete(this.sql, `e:${entry.id}`);
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  }
}
