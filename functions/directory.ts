import { DurableObject } from "cloudflare:workers";

import { json, kvDelete, kvGet, kvInit, kvList, kvPut, readBody, smallObject, str, type Sql } from "./storage";

/** A signed-in traveler as other people see them. */
export interface DirectoryEntry {
  userId: string;
  name: string;
  avatar: string;
  home: string;
  bio: string;
  upcoming: string;
  interests: string[];
  savedPlaceIds: string[];
  profile: Record<string, unknown> | null;
  updatedAt: number;
}

const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, maxLen)).slice(0, maxItems) : [];

/** Single global instance: the list of real travelers who chose to be discoverable. */
export class Directory extends DurableObject {
  private get sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    kvInit(this.sql);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // directory, [me|user], [id]
    const userId = request.headers.get("X-Rork-User-Id");

    if (parts[1] === "user" && parts[2] && request.method === "GET") {
      const entry = kvGet<DirectoryEntry>(this.sql, `u:${parts[2]}`);
      return entry ? json({ entry }) : json({ error: "That traveler isn't on XP Match anymore." }, 404);
    }

    if (!userId) return json({ error: "Sign in to see other travelers." }, 401);

    if (parts.length === 1 && request.method === "GET") {
      const entries = kvList<DirectoryEntry>(this.sql, "u:", 500).sort((a, b) => b.updatedAt - a.updatedAt);
      return json({ entries });
    }

    if (parts[1] === "me" && request.method === "PUT") {
      const body = await readBody<Record<string, unknown>>(request, 40_000);
      if (!body) return json({ error: "Invalid JSON" }, 400);
      const entry: DirectoryEntry = {
        userId,
        name: str(body.name, 40) || str(request.headers.get("X-Rork-User-Name"), 40) || "Traveler",
        avatar: str(body.avatar, 400),
        home: str(body.home, 60),
        bio: str(body.bio, 280),
        upcoming: str(body.upcoming, 60),
        interests: strList(body.interests, 6, 30),
        savedPlaceIds: strList(body.savedPlaceIds, 60, 40),
        profile: smallObject(body.profile),
        updatedAt: Date.now(),
      };
      kvPut(this.sql, `u:${userId}`, entry);
      return json({ entry });
    }

    if (parts[1] === "me" && request.method === "DELETE") {
      kvDelete(this.sql, `u:${userId}`);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }
}
