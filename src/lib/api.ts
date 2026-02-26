export type Employee = { id: string; employee_id: string; name: string; email: string };

const TOKEN_KEY = "md_session_token";
const EXP_KEY = "md_session_expires_at";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string, expires_at: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXP_KEY, expires_at);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXP_KEY);
}
export function isExpired(): boolean {
  const exp = localStorage.getItem(EXP_KEY);
  if (!exp) return true;
  return Date.now() > new Date(exp).getTime();
}

async function api(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: any = { "content-type": "application/json", ...(options.headers || {}) };
  if (token && !isExpired()) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function login(employee_id: string, pin: string) {
  return api("/api/login", { method: "POST", body: JSON.stringify({ employee_id, pin }) });
}

export async function enroll(payload: { enrollment_code: string; employee_id: string; name: string; email: string; pin: string }) {
  return api("/api/enroll", { method: "POST", body: JSON.stringify(payload) });
}

export async function notifyEvent(type: string, message: string) {
  return api("/api/notify-event", { method: "POST", body: JSON.stringify({ type, message }) });
}

export async function sendEod(payload: { report_date?: string; notes: string; handoff_notes: string }) {
  return api("/api/send-eod", { method: "POST", body: JSON.stringify(payload) });
}
