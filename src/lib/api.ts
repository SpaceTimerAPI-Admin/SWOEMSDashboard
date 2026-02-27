// Central API client for the SWOEMS dashboard.
// This file is intentionally light on types to keep builds unblocked.

import { getToken } from "./auth";

type JsonValue = any;

function authHeaders(extra?: Record<string, string>) {
  const token = getToken();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers as any),
    },
    credentials: "include",
  });
}

async function readError(res: Response): Promise<{ error: string; detail?: string }> {
  const ct = res.headers.get("content-type") || "";
  let body: any = null;

  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }

  if (body && typeof body === "object") {
    return { error: body.error || body.message || `HTTP ${res.status}`, detail: body.detail };
  }
  return { error: typeof body === "string" && body ? body : `HTTP ${res.status}` };
}

async function fetchJson<T = JsonValue>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    const e = await readError(res);
    const msg = e.detail ? `${e.error} — ${e.detail}` : e.error;
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  // Some endpoints may return text.
  return (await res.text()) as any as T;
}

/** Auth */
export async function enroll(payload: {
  enrollment_code: string;
  employee_id: string;
  name: string;
  email: string;
  pin: string;
}) {
  return fetchJson("/api/enroll", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function login(payload: { employee_id: string; pin: string }) {
  return fetchJson("/api/login", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

/** Tickets */
export async function listTickets() {
  return fetchJson("/api/tickets-list", { method: "GET", headers: authHeaders() });
}

export async function getTicket(id: string) {
  return fetchJson(`/api/tickets-get?id=${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders() });
}

export async function createTicket(payload: { title: string; location: string; description?: string }) {
  return fetchJson("/api/tickets-create", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function addTicketComment(payload: { id: string; comment: string; photo_keys?: string[] }) {
  return fetchJson("/api/tickets-comment", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function closeTicket(payload: { id: string }) {
  return fetchJson("/api/tickets-close", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function convertTicket(payload: { id: string }) {
  return fetchJson("/api/tickets-convert", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function getTicketPhotoUploadUrl(payload: { ticket_id: string; filename: string; content_type: string }) {
  return fetchJson("/api/tickets-photo-upload-url", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function confirmTicketPhoto(payload: { ticket_id: string; storage_key: string }) {
  return fetchJson("/api/tickets-photo-confirm", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

/** Projects */
export async function listProjects() {
  return fetchJson("/api/projects-list", { method: "GET", headers: authHeaders() });
}

export async function getProject(id: string) {
  return fetchJson(`/api/projects-get?id=${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders() });
}

export async function createProject(payload: { title: string; location: string; description?: string }) {
  return fetchJson("/api/projects-create", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function addProjectComment(payload: { id: string; comment: string; photo_keys?: string[] }) {
  return fetchJson("/api/projects-comment", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function closeProject(payload: { id: string }) {
  return fetchJson("/api/projects-close", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function getProjectPhotoUploadUrl(payload: { project_id: string; filename: string; content_type: string }) {
  return fetchJson("/api/projects-photo-upload-url", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function confirmProjectPhoto(payload: { project_id: string; storage_key: string }) {
  return fetchJson("/api/projects-photo-confirm", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

/** EOD */
export async function sendEod(payload: { to?: string; subject?: string; notes?: string }) {
  return fetchJson("/api/send-eod", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

/** GroupMe test helper (optional) */
export async function groupmeTest(payload: { text: string }) {
  return fetchJson("/api/groupme-test", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}
