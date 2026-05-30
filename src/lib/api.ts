// src/lib/api.ts
// Central API client for SWOEMS Dashboard.
// This file is intentionally defensive: it accepts both legacy and current field names
// so UI pages can evolve without breaking deploys.

import { getToken, setToken, clearToken, isExpired } from "./auth";

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
  const r = await apiFetch<{ token: string }>("/api/login", {
    method: "POST",
    body: { employee_id, pin },
  });
  if (r.ok && r.data?.token) setToken(r.data.token);
  return r;
}

export async function enroll(payload: { employee_id: string; name: string; pin: string; code: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/enroll", { method: "POST", body: payload });
}


export async function resetPin(payload: { employee_id: string; new_pin: string; admin_code: string }): Promise<ApiResult<{}>> {
  // Admin-only PIN reset
  return apiFetch<{}>("/api/reset-pin", { method: "POST", body: payload });
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
}): Promise<ApiResult<{ ticket: Ticket }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ ticket: Ticket }>("/api/tickets-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details },
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
}): Promise<ApiResult<{ project: Project }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ project: Project }>("/api/projects-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details },
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

export async function sendEod(payload: { to?: string; subject?: string; notes?: string; handoff_notes?: string }): Promise<ApiResult<{}>> {
  // accept handoff_notes legacy; server expects notes
  const notes = payload.notes ?? payload.handoff_notes ?? "";
  return apiFetch<{}>("/api/send-eod", { method: "POST", body: { to: payload.to, subject: payload.subject, notes } });
}

export async function notifyEvent(payload: { type: string; message: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/notify-event", { method: "POST", body: payload });
}

export async function assignProject(id: string, assigned_to: string | null): Promise<ApiResult<{}>> {
  return apiFetch("/api/projects-assign", { method: "POST", body: { id, assigned_to } });
}

// -------------------- Auth helpers --------------------
export async function updateEmail(email: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/update-email", { method: "POST", body: { email } });
}

// -------------------- Tickets extended --------------------
export async function assignTicket(id: string, assigned_to: string | null): Promise<ApiResult<{}>> {
  return apiFetch("/api/tickets-assign", { method: "POST", body: { id, assigned_to } });
}
export async function reopenTicket(id: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/tickets-reopen", { method: "POST", body: { id } });
}

// -------------------- Projects extended --------------------
export async function reopenProject(id: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/projects-reopen", { method: "POST", body: { id } });
}

// -------------------- Employees --------------------
export async function listEmployees(): Promise<ApiResult<{ employees: any[]; assignment_options?: any[] }>> {
  return apiFetch("/api/employees-list", { method: "POST", body: {} });
}

// -------------------- Shift Log --------------------
export async function addShiftLogEntry(note: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/shift-log-add", { method: "POST", body: { note } });
}
export async function listShiftLogEntries(): Promise<ApiResult<{ entries: any[] }>> {
  return apiFetch("/api/shift-log-list", { method: "POST", body: {} });
}

// -------------------- EOD --------------------
export async function getEodToday(): Promise<ApiResult<{ day: string; tickets: any[]; projects: any[]; shift_log_entries?: any[] }>> {
  return apiFetch("/api/eod-today", { method: "POST", body: {} });
}

// -------------------- Schedule --------------------
export async function uploadSchedule(payload: { image_base64: string; content_type: string }): Promise<ApiResult<{ count: number; dates: string[]; entries: any[] }>> {
  return apiFetch("/api/schedule-upload", { method: "POST", body: payload });
}
export async function getTodaySchedule(): Promise<ApiResult<{ date: string; entries: any[] }>> {
  return apiFetch("/api/schedule-today", { method: "POST", body: {} });
}
export async function getWeekSchedule(week_start?: string): Promise<ApiResult<{ week_start: string; week_end: string; entries: any[] }>> {
  return apiFetch("/api/schedule-week", { method: "POST", body: { week_start: week_start || "" } });
}
export async function scheduleUpdateEntry(payload: { action: "upsert" | "delete"; work_date: string; employee_name: string; shift_start?: string; shift_end?: string }): Promise<ApiResult<{}>> {
  return apiFetch("/api/schedule-update", { method: "POST", body: payload });
}

// -------------------- BEO Events --------------------
export async function uploadBeo(payload: { pdf_base64: string; filename: string; event_date?: string }): Promise<ApiResult<{ event: any }>> {
  return apiFetch("/api/beo-upload", { method: "POST", body: payload });
}
export async function listBeoEvents(month?: string): Promise<ApiResult<{ events: any[] }>> {
  return apiFetch("/api/beo-list", { method: "POST", body: { month: month || "" } });
}
export async function listDeletedBeoEvents(): Promise<ApiResult<{ events: any[] }>> {
  return apiFetch("/api/beo-list", { method: "POST", body: { include_deleted: true } });
}
export async function getBeoEvent(beo_id: string): Promise<ApiResult<{ event: any }>> {
  return apiFetch("/api/beo-get", { method: "POST", body: { beo_id } });
}
export async function completeBeoAction(beo_id: string, action_type: "setup" | "strike"): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-action", { method: "POST", body: { beo_id, action_type } });
}
export async function uploadBeoPhoto(payload: { beo_id: string; image_base64: string; content_type: string }): Promise<ApiResult<{ public_url: string }>> {
  return apiFetch("/api/beo-photo-upload", { method: "POST", body: payload });
}
export async function deleteBeoEvent(beo_id: string, reason: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-delete", { method: "POST", body: { beo_id, reason } });
}
export async function restoreBeoEvent(beo_id: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-restore", { method: "POST", body: { beo_id } });
}
export async function getTodayBeo(): Promise<ApiResult<{ today: string; events: any[] }>> {
  return apiFetch("/api/beo-today", { method: "POST", body: {} });
}

// -------------------- Admin --------------------
export async function adminListUsers(): Promise<ApiResult<{ employees: any[] }>> {
  return apiFetch("/api/admin-users-list", { method: "POST", body: {} });
}
export async function adminCreateUser(payload: { employee_id: string; name: string; email: string; pin: string; role: string }): Promise<ApiResult<{ employee: any }>> {
  return apiFetch("/api/admin-user-create", { method: "POST", body: payload });
}
export async function adminUpdateUser(payload: { id: string; name?: string; email?: string; role?: string; is_active?: boolean; pin?: string }): Promise<ApiResult<{ employee: any }>> {
  return apiFetch("/api/admin-user-update", { method: "POST", body: payload });
}
export async function getDocsUrl(): Promise<ApiResult<{ url: string }>> {
  return apiFetch("/api/docs-url", { method: "POST", body: {} });
}
