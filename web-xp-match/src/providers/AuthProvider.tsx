import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";

const AUTH_URL = import.meta.env.EXPO_PUBLIC_RORK_AUTH_URL as string | undefined;
const APP_KEY = import.meta.env.EXPO_PUBLIC_RORK_APP_KEY as string | undefined;
const APP_PATH = "web-xp-match";

const ACCESS_KEY = "rork:access_token";
const REFRESH_KEY = "rork:refresh_token";
const VERIFIER_KEY = "rork:pkce_verifier";
const EXPIRED_EVENT = "xp:auth-expired";
/** Where to land after a full-page (production) sign-in redirect. */
export const RETURN_TO_KEY = "xp.returnTo";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const makeVerifier = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
};

const makeChallenge = async (verifier: string): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
};

interface JwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  exp?: number;
}

const decode = (token: string): JwtPayload | null => {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = decodeURIComponent(
      atob(part.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
};

const userFromToken = (token: string): AuthUser | null => {
  const p = decode(token);
  if (!p?.sub) return null;
  return { id: p.sub, email: p.email ?? "", name: p.name, picture: p.picture };
};

const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(VERIFIER_KEY);
};

let refreshing: Promise<string | null> | null = null;

/** Exchanges the refresh token for a new access token; deduplicates concurrent calls. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const stored = localStorage.getItem(REFRESH_KEY);
    if (!stored || !AUTH_URL || !APP_KEY) return null;
    try {
      const res = await fetch(`${AUTH_URL}/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_key: APP_KEY, refresh_token: stored }),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          clearTokens();
          window.dispatchEvent(new Event(EXPIRED_EVENT));
        }
        return null;
      }
      const { access_token } = (await res.json()) as { access_token: string };
      localStorage.setItem(ACCESS_KEY, access_token);
      return access_token;
    } catch (e) {
      console.warn("[auth] refresh failed", e instanceof Error ? e.message : e);
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Returns a valid access token, refreshing it when it is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    const p = decode(token);
    if (p && (!p.exp || p.exp * 1000 > Date.now() + 60_000)) return token;
  }
  return refreshAccessToken();
}

/** fetch() that attaches the Rork Auth bearer token when signed in. */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const t = localStorage.getItem(ACCESS_KEY);
    return t && localStorage.getItem(REFRESH_KEY) ? userFromToken(t) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem(REFRESH_KEY)));
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const isConfigured = Boolean(AUTH_URL && APP_KEY);

  useEffect(() => {
    let alive = true;
    if (localStorage.getItem(REFRESH_KEY)) {
      void getAccessToken().then((t) => {
        if (!alive) return;
        if (t) setUser(userFromToken(t));
        else if (!localStorage.getItem(REFRESH_KEY)) setUser(null);
        setIsLoading(false);
      });
    }
    const onExpired = () => setUser(null);
    window.addEventListener(EXPIRED_EVENT, onExpired);
    return () => {
      alive = false;
      window.removeEventListener(EXPIRED_EVENT, onExpired);
      cleanupRef.current?.();
    };
  }, []);

  const exchangeCode = useCallback(async (code: string) => {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    if (!verifier || !AUTH_URL || !APP_KEY) {
      setError("Your sign-in session expired. Please try again.");
      return;
    }
    localStorage.removeItem(VERIFIER_KEY);
    try {
      const res = await fetch(`${AUTH_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_key: APP_KEY, code, code_verifier: verifier }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Sign in failed (${res.status})`);
        return;
      }
      const { access_token, refresh_token, user: u } = (await res.json()) as { access_token: string; refresh_token: string; user?: AuthUser };
      localStorage.setItem(ACCESS_KEY, access_token);
      localStorage.setItem(REFRESH_KEY, refresh_token);
      setUser(u?.id ? u : userFromToken(access_token));
      setError(null);
    } catch (e) {
      console.warn("[auth] token exchange failed", e instanceof Error ? e.message : e);
      setError("Couldn't finish signing in. Check your connection and try again.");
    }
  }, []);

  const signIn = useCallback(
    async (provider: "google" | "apple") => {
      if (!AUTH_URL || !APP_KEY) {
        setError("Sign-in isn't configured yet.");
        return;
      }
      setError(null);
      const isPreview = window.parent !== window;
      // Open the popup synchronously inside the click so browsers don't block it.
      const popup = isPreview ? window.open("", "rork-auth", "width=500,height=650") : null;
      if (isPreview && !popup) {
        setError("Your browser blocked the sign-in window. Allow popups and try again.");
        return;
      }
      setIsSigningIn(true);
      try {
        const verifier = makeVerifier();
        const challenge = await makeChallenge(verifier);
        localStorage.setItem(VERIFIER_KEY, verifier);
        const body: Record<string, unknown> = { app_key: APP_KEY, provider, code_challenge: challenge, target: "web", env: isPreview ? "preview" : "production" };
        if (isPreview) body.app_path = APP_PATH;
        const res = await fetch(`${AUTH_URL}/oauth/initiate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) {
          localStorage.removeItem(VERIFIER_KEY);
          popup?.close();
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setError(err.error ?? `Sign in failed (${res.status})`);
          return;
        }
        const { auth_url } = (await res.json()) as { auth_url: string };
        if (!popup) {
          sessionStorage.setItem(RETURN_TO_KEY, `${window.location.pathname}${window.location.search}`);
          window.location.href = auth_url;
          return;
        }
        popup.location.href = auth_url;
        await new Promise<void>((resolve) => {
          const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; code?: string } | null;
            if (data?.type !== "rork_auth_callback") return;
            done();
            if (data.code) void exchangeCode(data.code).finally(resolve);
            else resolve();
          };
          const poll = window.setInterval(() => {
            if (popup.closed) {
              done();
              localStorage.removeItem(VERIFIER_KEY);
              resolve();
            }
          }, 500);
          const done = () => {
            window.removeEventListener("message", onMessage);
            window.clearInterval(poll);
            cleanupRef.current = null;
          };
          cleanupRef.current = done;
          window.addEventListener("message", onMessage);
        });
      } catch (e) {
        console.warn("[auth] sign in failed", e instanceof Error ? e.message : e);
        setError("Sign in failed. Please try again.");
        localStorage.removeItem(VERIFIER_KEY);
        popup?.close();
      } finally {
        setIsSigningIn(false);
      }
    },
    [exchangeCode],
  );

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { user, isLoading, isSigningIn, error, isConfigured, signIn, signOut, clearError, exchangeCode };
});
