/** Same-origin path to the XP Match Cloudflare backend. */
export const BACKEND_PATH = "/~api";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** URL-safe random id (used for room ids, share ids and share keys). */
export const randomId = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
};

const CLIENT_KEY = "xp.client.v1";

/** Stable per-device id, never synced, used to tell collaborators apart. */
export const getClientId = (): string => {
  try {
    const existing = window.localStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const id = randomId(16);
    window.localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return "anon";
  }
};

/** Parses a JSON response and throws a readable error on failure. */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(res.ok ? "Unexpected response from the server." : `Server error (${res.status})`);
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}
