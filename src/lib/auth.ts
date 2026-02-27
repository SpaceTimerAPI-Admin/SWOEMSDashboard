// Token utilities for the SWOEMS dashboard.
// Kept separate from api.ts to avoid circular imports and TS build failures.

const TOKEN_KEY = "md_session_token";

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Best-effort JWT expiry check.
 * Returns false if token can't be parsed.
 */
export function isExpired(token?: string | null): boolean {
  const t = token ?? getToken();
  if (!t) return true;

  try {
    const parts = t.split(".");
    if (parts.length < 2) return false;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    const exp = payload?.exp;
    if (!exp || typeof exp !== "number") return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= exp;
  } catch {
    return false;
  }
}
