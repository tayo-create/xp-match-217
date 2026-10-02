/** Minimal shape of a Durable Object's SQLite handle that these helpers need. */
export interface Sql {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

/** Creates the tiny key/value table each Durable Object uses for its JSON documents. */
export function kvInit(sql: Sql): void {
  sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
}

export function kvGet<T>(sql: Sql, key: string): T | null {
  const rows = sql.exec("SELECT v FROM kv WHERE k = ?", key).toArray();
  if (!rows.length) return null;
  try {
    return JSON.parse(String(rows[0].v)) as T;
  } catch {
    return null;
  }
}

export function kvPut(sql: Sql, key: string, value: unknown): void {
  sql.exec("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", key, JSON.stringify(value));
}

export function kvDelete(sql: Sql, key: string): void {
  sql.exec("DELETE FROM kv WHERE k = ?", key);
}

/** All values whose key starts with `prefix` (capped). */
export function kvList<T>(sql: Sql, prefix: string, limit = 500): T[] {
  const rows = sql.exec("SELECT v FROM kv WHERE k >= ? AND k < ? LIMIT ?", prefix, `${prefix}\uffff`, limit).toArray();
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(String(r.v)) as T);
    } catch {
      // skip unreadable rows
    }
  }
  return out;
}

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const MAX_BODY = 1_800_000;

/** Reads a JSON body, returning null when it's missing, too large or malformed. */
export async function readBody<T>(request: Request, max = MAX_BODY): Promise<T | null> {
  const text = await request.text();
  if (!text || text.length > max) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Trimmed string or "" when the value isn't a string. */
export const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const randomToken = (length = 32): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
};

/** Small JSON object (e.g. a taste profile) or null when absent or oversized. */
export const smallObject = (v: unknown, max = 12_000): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= max ? (v as Record<string, unknown>) : null;
