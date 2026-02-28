/**
 * Client-side auth helpers for SWOEMS Dashboard
 * Stores a session token in localStorage and provides simple helpers.
 */

const TOKEN_KEY = "md_session_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function parseJwt(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Returns true if token has an `exp` claim and it is in the past.
 * If token isn't a JWT or has no exp, we treat it as non-expiring.
 */
export function isExpired(token: string): boolean {
  const payload = parseJwt(token);
  const exp = payload?.exp;
  if (!exp || typeof exp !== "number") return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec >= exp;
}

/** Convenience: token exists and not expired */
export function isAuthed(): boolean {
  const t = getToken();
  if (!t) return false;
  return !isExpired(t);
}

/** Clears auth and returns user to login screen */
export function logout(): void {
  clearToken();
  // Hard redirect keeps things simple for SPA + Netlify
  window.location.href = "/login";
}
