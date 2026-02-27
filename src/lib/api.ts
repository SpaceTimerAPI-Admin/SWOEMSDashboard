// Central API client for the SWOEMS dashboard.
// Intentionally tolerant on payload shapes to prevent TS build breaks.

import { clearToken, getToken, isExpired, setToken } from "./auth";

type JsonValue = any;

export { clearToken, getToken, isExpired, setToken };

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
  return (await res.text()) as any as T;
}

function qp(obj: Record<string, any> | undefined) {
  if (!obj) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Auth */
export async function enroll(payload: any) {
  return fetchJson("/api/enroll", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

/**
 * login(payload) OR login(employee_id, pin)
 * Returns whatever the server returns. Frontend may store token separately.
 */
export async function login(payloadOrEmployeeId: any, maybePin?: any) {
  const payload =
    typeof payloadOrEmployeeId === "string"
      ? { employee_id: payloadOrEmployeeId, pin: String(maybePin ?? "") }
      : payloadOrEmployeeId;

  return fetchJson("/api/login", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

/** Tickets */
export async function listTickets(opts?: any) {
  return fetchJson(`/api/tickets-list${qp(opts)}`, { method: "GET", headers: authHeaders() });
}

export async function getTicket(id: string) {
  return fetchJson(`/api/tickets-get?id=${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders() });
}

export async function createTicket(payload: any) {
  const body = {
    title: payload?.title,
    location: payload?.location,
    description: payload?.description ?? payload?.details,
  };
  return fetchJson("/api/tickets-create", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function addTicketComment(payload: any) {
  const body = {
    id: payload?.id ?? payload?.ticket_id,
    comment: payload?.comment,
    photo_keys: payload?.photo_keys,
  };
  return fetchJson("/api/tickets-comment", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function closeTicket(payload: any) {
  const body = { id: payload?.id ?? payload?.ticket_id };
  return fetchJson("/api/tickets-close", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function convertTicket(payload: any) {
  const body = { id: payload?.id ?? payload?.ticket_id };
  return fetchJson("/api/tickets-convert", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function getTicketPhotoUploadUrl(payload: any) {
  const body = {
    ticket_id: payload?.ticket_id,
    filename: payload?.filename ?? payload?.file_name,
    content_type: payload?.content_type,
  };
  return fetchJson("/api/tickets-photo-upload-url", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

export async function confirmTicketPhoto(payload: any) {
  const body = {
    ticket_id: payload?.ticket_id,
    storage_key: payload?.storage_key ?? payload?.storage_path,
  };
  return fetchJson("/api/tickets-photo-confirm", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

/** Projects */
export async function listProjects(opts?: any) {
  return fetchJson(`/api/projects-list${qp(opts)}`, { method: "GET", headers: authHeaders() });
}

export async function getProject(id: string) {
  return fetchJson(`/api/projects-get?id=${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders() });
}

export async function createProject(payload: any) {
  const body = {
    title: payload?.title,
    location: payload?.location,
    description: payload?.description ?? payload?.details,
  };
  return fetchJson("/api/projects-create", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function addProjectComment(payload: any) {
  const body = {
    id: payload?.id ?? payload?.project_id,
    comment: payload?.comment,
    photo_keys: payload?.photo_keys,
  };
  return fetchJson("/api/projects-comment", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function closeProject(payload: any) {
  const body = { id: payload?.id ?? payload?.project_id };
  return fetchJson("/api/projects-close", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

export async function getProjectPhotoUploadUrl(payload: any) {
  const body = {
    project_id: payload?.project_id,
    filename: payload?.filename ?? payload?.file_name,
    content_type: payload?.content_type,
  };
  return fetchJson("/api/projects-photo-upload-url", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

export async function confirmProjectPhoto(payload: any) {
  const body = {
    project_id: payload?.project_id,
    storage_key: payload?.storage_key ?? payload?.storage_path,
  };
  return fetchJson("/api/projects-photo-confirm", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

/** EOD */
export async function sendEod(payload: any) {
  const body = {
    to: payload?.to,
    subject: payload?.subject,
    notes: payload?.notes ?? payload?.handoff_notes,
  };
  return fetchJson("/api/send-eod", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
}

/** GroupMe test helper (optional) */
export async function groupmeTest(payload: any) {
  return fetchJson("/api/groupme-test", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}
