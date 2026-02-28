// src/lib/api.ts
// Central API client for SWOEMS Dashboard.
// This file is intentionally defensive: it accepts both legacy and current field names
// so UI pages can evolve without breaking deploys.

import { getToken, setToken, clearToken, isExpired, setProfile } from "./auth";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

async function apiFetch<T>(
  path: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: opts?.method ?? "GET",
      headers: { ...authHeaders(opts?.headers), ...(opts?.headers ?? {}) },
      body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "include",
    });

    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg =
        typeof payload === "string"
          ? payload
          : (payload?.error as string) || (payload?.message as string) || `Request failed (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    // Many of our Netlify functions return { ok: true, ... } already.
    // Normalize to ApiResult<T> where possible.
    if (typeof payload === "object" && payload && "ok" in payload) {
      if ((payload as any).ok === false) return { ok: false, error: (payload as any).error ?? "Request failed", status: res.status };
      if ("data" in (payload as any)) return { ok: true, data: (payload as any).data as T };
      // If payload is {ok:true, ...rest}, treat rest as data.
      const { ok, ...rest } = payload as any;
      return { ok: true, data: rest as T };
    }

    return { ok: true, data: payload as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

// -------------------- Auth --------------------

export async function login(employee_id: string, pin: string): Promise<ApiResult<{ token: string }>> {
  const r = await apiFetch<{ token: string; employee?: any }>("/api/login", {
    method: "POST",
    body: { employee_id, pin },
  });
  if (r.ok && r.data?.token) {
    setToken(r.data.token);
    if (r.data?.employee) setProfile(r.data.employee);
  }
  return r;
}

export async function enroll(payload: { employee_id: string; name: string; pin: string; code: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/enroll", { method: "POST", body: payload });
}


export async function resetPin(payload: { employee_id: string; new_pin: string; admin_code: string }): Promise<ApiResult<{}>> {
  // Admin-only PIN reset
  return apiFetch<{}>("/api/reset-pin", { method: "POST", body: payload });
}

export async function updateEmail(email: string): Promise<ApiResult<{ email: string }>> {
  return apiFetch<{ email: string }>("/api/update-email", { method: "POST", body: { email } });
}

// Backwards-compat re-exports (some pages historically imported these from lib/api)
export { setToken, getToken, clearToken, isExpired };

// -------------------- Tickets --------------------

export type Ticket = {
  id: string;
  title: string;
  location: string;
  details: string;
  status: "open" | "closed" | "project";
  created_at?: string;
  updated_at?: string;
  photo_keys?: string[];
};

export async function listTickets(opts?: { includeClosed?: boolean }): Promise<ApiResult<{ tickets: Ticket[] }>> {
  // server-side can ignore includeClosed; UI will filter if needed
  return apiFetch<{ tickets: Ticket[] }>("/api/tickets-list", { method: "POST", body: opts ?? {} });
}

export async function getTicket(id: string): Promise<ApiResult<{ ticket: Ticket; comments?: any[] }>> {
  return apiFetch<{ ticket: Ticket; comments?: any[] }>("/api/tickets-get", { method: "POST", body: { id } });
}

export async function createTicket(input: {
  title: string;
  location: string;
  details?: string;
  description?: string; // legacy name
  tag?: string;
}): Promise<ApiResult<{ ticket: Ticket }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ ticket: Ticket }>("/api/tickets-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details, tag: input.tag ?? "" },
  });
}

export async function addTicketComment(input: {
  id?: string;
  ticket_id?: string; // legacy
  comment: string;
  photo_keys?: string[];
}): Promise<ApiResult<{}>> {
  const id = input.id ?? input.ticket_id;
  return apiFetch<{}>("/api/tickets-comment", { method: "POST", body: { id, comment: input.comment, photo_keys: input.photo_keys ?? [] } });
}

export async function closeTicket(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/tickets-close", { method: "POST", body: { id } });
}

export async function convertTicket(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/tickets-convert", { method: "POST", body: { id } });
}


// Backwards-compatible alias
export const convertTicketToProject = convertTicket;

// Photo upload helpers (Supabase storage presign)
export async function getTicketPhotoUploadUrl(input: {
  ticket_id: string;
  filename?: string;
  file_name?: string; // legacy
  content_type: string;
}): Promise<ApiResult<{ upload_url: string; storage_key: string }>> {
  return apiFetch<{ upload_url: string; storage_key: string }>("/api/tickets-photo-upload-url", {
    method: "POST",
    body: {
      ticket_id: input.ticket_id,
      filename: input.filename ?? input.file_name,
      content_type: input.content_type,
    },
  });
}

export async function confirmTicketPhoto(input: { ticket_id: string; storage_key?: string; storage_path?: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/tickets-photo-confirm", {
    method: "POST",
    body: { ticket_id: input.ticket_id, storage_key: input.storage_key ?? input.storage_path },
  });
}

// -------------------- Projects --------------------

export type Project = {
  id: string;
  title: string;
  location: string;
  details: string;
  status: "open" | "closed";
  created_at?: string;
  updated_at?: string;
  photo_keys?: string[];
};

export async function listProjects(opts?: { includeClosed?: boolean }): Promise<ApiResult<{ projects: Project[] }>> {
  return apiFetch<{ projects: Project[] }>("/api/projects-list", { method: "POST", body: opts ?? {} });
}

export async function getProject(id: string): Promise<ApiResult<{ project: Project; comments?: any[] }>> {
  return apiFetch<{ project: Project; comments?: any[] }>("/api/projects-get", { method: "POST", body: { id } });
}

export async function createProject(input: {
  title: string;
  location: string;
  details?: string;
  description?: string; // legacy name
  tag?: string;
}): Promise<ApiResult<{ project: Project }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ project: Project }>("/api/projects-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details, tag: input.tag ?? "" },
  });
}

export async function addProjectComment(input: {
  id?: string;
  project_id?: string; // legacy
  comment: string;
  photo_keys?: string[];
}): Promise<ApiResult<{}>> {
  const id = input.id ?? input.project_id;
  return apiFetch<{}>("/api/projects-comment", { method: "POST", body: { id, comment: input.comment, photo_keys: input.photo_keys ?? [] } });
}

export async function closeProject(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/projects-close", { method: "POST", body: { id } });
}

export async function getProjectPhotoUploadUrl(input: {
  project_id: string;
  filename?: string;
  file_name?: string; // legacy
  content_type: string;
}): Promise<ApiResult<{ upload_url: string; storage_key: string }>> {
  return apiFetch<{ upload_url: string; storage_key: string }>("/api/projects-photo-upload-url", {
    method: "POST",
    body: {
      project_id: input.project_id,
      filename: input.filename ?? input.file_name,
      content_type: input.content_type,
    },
  });
}

export async function confirmProjectPhoto(input: { project_id: string; storage_key?: string; storage_path?: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/projects-photo-confirm", {
    method: "POST",
    body: { project_id: input.project_id, storage_key: input.storage_key ?? input.storage_path },
  });
}

// -------------------- EOD / Events --------------------

export async function sendEod(payload: { to?: string; subject?: string; notes?: string; handoff_notes?: string }): Promise<ApiResult<{ emailed_to: string; ticket_count: number; project_count: number }>> {
  return apiFetch<{ emailed_to: string; ticket_count: number; project_count: number }>("/api/send-eod", {
    method: "POST",
    body: {
      to: payload.to,
      subject: payload.subject,
      notes: payload.notes ?? "",
      handoff_notes: payload.handoff_notes ?? "",
    },
  });
}

export async function notifyEvent(payload: { type: string; message: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/notify-event", { method: "POST", body: payload });
}
