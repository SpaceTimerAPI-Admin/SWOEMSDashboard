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


export type Ticket = {
  id: string;
  title: string;
  location: string;
  details: string;
  status: string;
  created_at: string;
  sla_due_at: string;
  sla_minutes: number;
  created_by: string;
  created_by_name?: string;
  ms_left?: number;
  is_overdue?: boolean;
};

export async function listTickets(includeClosed = false) {
  const qs = includeClosed ? "?includeClosed=1" : "";
  return api(`/api/tickets-list${qs}`, { method: "GET" });
}

export async function createTicket(payload: { title: string; location: string; details: string; sla_minutes?: number }) {
  return api("/api/tickets-create", { method: "POST", body: JSON.stringify(payload) });
}

export async function getTicket(id: string) {
  return api(`/api/tickets-get?id=${encodeURIComponent(id)}`, { method: "GET" });
}

export async function addTicketComment(payload: { ticket_id: string; comment: string }) {
  return api("/api/tickets-comment", { method: "POST", body: JSON.stringify(payload) });
}

export async function closeTicket(payload: { id: string; comment?: string }) {
  return api("/api/tickets-close", { method: "POST", body: JSON.stringify(payload) });
}

export async function convertTicket(payload: { ticket_id: string }) {
  return api("/api/tickets-convert", { method: "POST", body: JSON.stringify(payload) });
}


export async function getTicketPhotoUploadUrl(payload: { ticket_id: string; file_name: string; content_type: string }) {
  return api("/api/tickets-photo-upload-url", { method: "POST", body: JSON.stringify(payload) });
}

export async function confirmTicketPhoto(payload: { ticket_id: string; storage_path: string }) {
  return api("/api/tickets-photo-confirm", { method: "POST", body: JSON.stringify(payload) });
}
