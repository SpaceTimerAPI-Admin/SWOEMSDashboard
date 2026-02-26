import { clearToken, getToken, isExpired } from "./api";

export function isAuthed() {
  const t = getToken();
  return !!t && !isExpired();
}

export function logout() {
  clearToken();
  window.location.href = "/login";
}
