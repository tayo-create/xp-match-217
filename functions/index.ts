// XP Match backend: cloud sync, live trip rooms with members, public itinerary links,
// a directory of real travelers, direct messages between signed-in users, and a community feed.

export { Directory } from "./directory";
export { Feed } from "./feed";
export { Feedback } from "./feedback";
export { Inbox } from "./inbox";
export { PlaceCache } from "./places";
export { SharedTrip } from "./shared-trip";
export { TripRoom } from "./trip-room";
export { UserStore } from "./user-store";

import { citySlug } from "./places";
import { json, randomToken, readBody, str } from "./storage";

type Env = { DO: Fetcher };

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const USER_RE = /^[A-Za-z0-9_|:.@-]{1,128}$/;

const dispatch = (request: Request, env: Env, cls: string, id: string): Promise<Response> => {
  const wrapped = new Request(request.url, request);
  wrapped.headers.set("X-Rork-DO-Class", cls);
  wrapped.headers.set("X-Rork-DO-Id", id);
  return env.DO.fetch(wrapped);
};

const internal = (base: string, env: Env, cls: string, id: string, path: string, method: string, body?: unknown): Promise<Response> =>
  env.DO.fetch(
    new Request(new URL(path, base), {
      method,
      headers: { "Content-Type": "application/json", "X-Rork-DO-Class": cls, "X-Rork-DO-Id": id },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/** Sends a DM: writes it to both people's inboxes. */
async function sendDm(request: Request, env: Env, toId: string): Promise<Response> {
  const fromId = request.headers.get("X-Rork-User-Id");
  if (!fromId) return json({ error: "Sign in to send messages." }, 401);
  if (!USER_RE.test(toId) || toId === fromId) return json({ error: "You can't message that person." }, 400);
  const body = await readBody<{ text?: string; name?: string; avatar?: string; id?: string }>(request, 8_000);
  const text = str(body?.text, 2000);
  if (!text) return json({ error: "Message is empty." }, 400);

  const recipientRes = await internal(request.url, env, "Directory", "global", `/directory/user/${encodeURIComponent(toId)}`, "GET");
  if (!recipientRes.ok) return json({ error: "That traveler isn't on XP Match anymore." }, 404);
  const { entry } = (await recipientRes.json()) as { entry: { name: string; avatar: string } };

  const dm = { id: str(body?.id, 64) || `dm-${randomToken(12)}`, fromId, text, at: Date.now() };
  const fromName = str(body?.name, 40) || str(request.headers.get("X-Rork-User-Name"), 40) || "Traveler";
  const fromAvatar = str(body?.avatar, 400);
  await Promise.all([
    internal(request.url, env, "Inbox", fromId, "/internal/deliver", "POST", { otherId: toId, otherName: entry.name, otherAvatar: entry.avatar, dm, incoming: false }),
    internal(request.url, env, "Inbox", toId, "/internal/deliver", "POST", { otherId: fromId, otherName: fromName, otherAvatar: fromAvatar, dm, incoming: true }),
  ]);
  return json({ dm });
}

/** Calls a Durable Object on behalf of the signed-in user. */
const asUser = (base: string, env: Env, userId: string, cls: string, id: string, path: string, method: string): Promise<Response> =>
  env.DO.fetch(new Request(new URL(path, base), { method, headers: { "X-Rork-DO-Class": cls, "X-Rork-DO-Id": id, "X-Rork-User-Id": userId } }));

/** Reports a feed post: counts it on the post (3 reports hide it) and files it in the beta inbox. */
async function reportPost(request: Request, env: Env, postId: string): Promise<Response> {
  const userId = request.headers.get("X-Rork-User-Id");
  if (!userId) return json({ error: "Sign in to report posts." }, 401);
  const body = await readBody<{ reason?: string }>(request, 4_000);
  const res = await asUser(request.url, env, userId, "Feed", "global", `/feed/${postId}/report`, "POST");
  if (!res.ok) return res;
  const out = (await res.json()) as { hidden: boolean; reports: number; title: string; owner: string };
  await internal(request.url, env, "Feedback", "global", "/internal/report", "POST", { postId, reporter: userId, reason: str(body?.reason, 300) || "No reason given", ...out });
  return json({ ok: true, hidden: out.hidden });
}

/** Beta admin moderation: remove or restore a reported post. */
async function moderate(request: Request, env: Env, postId: string, action: "remove" | "restore"): Promise<Response> {
  const userId = request.headers.get("X-Rork-User-Id");
  if (!userId) return json({ error: "Sign in first." }, 401);
  const check = await internal(request.url, env, "Feedback", "global", `/internal/is-admin?u=${encodeURIComponent(userId)}`, "GET");
  const { admin } = (await check.json()) as { admin: boolean };
  if (!admin) return json({ error: "Only the beta admin can moderate posts." }, 403);
  return internal(request.url, env, "Feed", "global", `/internal/${action}/${postId}`, "POST");
}

/** Deletes everything stored for the signed-in person: synced data, directory card, messages and feed posts. */
async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const userId = request.headers.get("X-Rork-User-Id");
  if (!userId) return json({ error: "Sign in to delete your account." }, 401);
  await Promise.all([
    asUser(request.url, env, userId, "UserStore", userId, "/sync", "DELETE"),
    asUser(request.url, env, userId, "Directory", "global", "/directory/me", "DELETE"),
    asUser(request.url, env, userId, "Inbox", userId, "/internal/purge", "POST"),
    asUser(request.url, env, userId, "Feed", "global", "/internal/purge", "POST"),
  ]);
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const m = request.method;

    try {
      if (url.pathname === "/ping") return json({ ok: true, now: new Date().toISOString() });

      // City lookup (location, cover, intro) for live places, cached per city name.
      if (parts[0] === "places" && parts[1] === "city" && parts.length === 2 && (m === "GET" || m === "PUT")) {
        const q = str(url.searchParams.get("q"), 80);
        if (q.length < 2) return json({ error: "Which city?" }, 400);
        return dispatch(request, env, "PlaceCache", citySlug(q));
      }

      if (parts[0] === "sync" && parts.length === 1) {
        const userId = request.headers.get("X-Rork-User-Id");
        if (!userId) return json({ error: "Sign in to sync" }, 401);
        if (m !== "GET" && m !== "PUT") return json({ error: "Method not allowed" }, 405);
        return dispatch(request, env, "UserStore", userId);
      }

      if (parts[0] === "room" && parts[1] && ID_RE.test(parts[1])) {
        if (parts[2] === "ws") {
          if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Expected websocket" }, 426);
          return dispatch(request, env, "TripRoom", parts[1]);
        }
        const ok =
          (parts.length === 2 && m === "GET") ||
          (parts.length === 3 && (parts[2] === "ticket" || parts[2] === "join") && m === "POST") ||
          (parts[2] === "members" && ((parts.length === 3 && m === "POST") || (parts.length === 4 && m === "DELETE"))) ||
          (parts[2] === "removed" && parts.length === 4 && m === "DELETE");
        if (ok) return dispatch(request, env, "TripRoom", parts[1]);
      }

      if (parts[0] === "share" && parts[1] && ID_RE.test(parts[1])) {
        if (parts.length === 2 && ["GET", "PUT", "DELETE"].includes(m)) return dispatch(request, env, "SharedTrip", parts[1]);
        if (parts.length === 3 && (parts[2] === "request" || parts[2] === "admin") && m === "POST") return dispatch(request, env, "SharedTrip", parts[1]);
      }

      if (parts[0] === "directory") {
        const ok = (parts.length === 1 && m === "GET") || (parts[1] === "me" && parts.length === 2 && (m === "PUT" || m === "DELETE")) || (parts[1] === "user" && parts.length === 3 && m === "GET");
        if (ok) return dispatch(request, env, "Directory", "global");
      }

      if (parts[0] === "inbox") {
        const userId = request.headers.get("X-Rork-User-Id");
        if (!userId) return json({ error: "Sign in to see your messages." }, 401);
        if ((parts.length === 1 && m === "GET") || (parts[1] === "read" && parts.length === 3 && m === "POST")) return dispatch(request, env, "Inbox", userId);
      }

      if (parts[0] === "feed") {
        const ok =
          (parts.length === 1 && (m === "GET" || m === "POST")) ||
          (parts[1] === "places" && parts.length === 2 && m === "GET") ||
          (parts[1] === "upload" && parts.length === 2 && m === "POST") ||
          (parts[1] === "photo" && parts.length === 4 && m === "GET") ||
          (parts.length === 2 && ID_RE.test(parts[1]) && m === "DELETE") ||
          (parts.length === 3 && ID_RE.test(parts[1]) && (parts[2] === "like" || parts[2] === "copy") && m === "POST");
        if (ok) return dispatch(request, env, "Feed", "global");
        if (parts.length === 3 && ID_RE.test(parts[1]) && parts[2] === "report" && m === "POST") return reportPost(request, env, parts[1]);
        if (parts.length === 3 && ID_RE.test(parts[1]) && (parts[2] === "remove" || parts[2] === "restore") && m === "POST") return moderate(request, env, parts[1], parts[2]);
      }

      if (parts[0] === "feedback" && parts.length === 1 && m === "POST") return dispatch(request, env, "Feedback", "global");
      if (parts[0] === "beta") {
        const ok =
          (parts.length === 2 && ((parts[1] === "me" && m === "GET") || (parts[1] === "claim" && m === "POST") || (parts[1] === "feedback" && m === "GET"))) ||
          (parts[1] === "feedback" && Boolean(parts[2]) && ID_RE.test(parts[2] ?? "") && ((parts.length === 3 && m === "DELETE") || (parts.length === 4 && parts[3] === "resolve" && m === "POST")));
        if (ok) return dispatch(request, env, "Feedback", "global");
      }

      if (parts[0] === "account" && parts.length === 1 && m === "DELETE") return deleteAccount(request, env);

      if (parts[0] === "dm" && parts[1] && parts.length === 2 && m === "POST") return sendDm(request, env, decodeURIComponent(parts[1]));

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("request failed", url.pathname, err);
      return json({ error: "Something went wrong" }, 500);
    }
  },
};
