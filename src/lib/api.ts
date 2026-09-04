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

export async function enroll(payload: { employee_id: string; name: string; email: string; pin: string; enrollment_code: string }): Promise<ApiResult<{}>> {
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
  sla_minutes?: number;
}): Promise<ApiResult<{ ticket: Ticket }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ ticket: Ticket }>("/api/tickets-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details, tag: input.tag ?? "", sla_minutes: input.sla_minutes },
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
  sla_days?: number;
}): Promise<ApiResult<{ project: Project }>> {
  const details = (input.details ?? input.description ?? "").trim();
  return apiFetch<{ project: Project }>("/api/projects-create", {
    method: "POST",
    body: { title: input.title, location: input.location, details, tag: input.tag ?? "", sla_days: input.sla_days },
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

export async function sendEod(payload: { handoff_notes?: string; report_date?: string }): Promise<ApiResult<{ emailed_to: string; ticket_count: number; project_count: number }>> {
  return apiFetch<{ emailed_to: string; ticket_count: number; project_count: number }>("/api/send-eod", {
    method: "POST",
    body: {
      notes: "",
      handoff_notes: payload.handoff_notes ?? "",
      report_date: payload.report_date ?? "",
    },
  });
}

export async function notifyEvent(payload: { type: string; message: string }): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/notify-event", { method: "POST", body: payload });
}

// -------------------- Employees --------------------

export async function logoutServer(): Promise<void> {
  try { await apiFetch("/api/logout", { method: "POST", body: {} }); } catch {}
}

export async function reopenTicket(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/tickets-reopen", { method: "POST", body: { id } });
}

export async function reopenProject(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>("/api/projects-reopen", { method: "POST", body: { id } });
}

export async function getEodToday(date?: string): Promise<ApiResult<{
  day: string;
  tickets: any[];
  projects: any[];
  older_open_tickets: any[];
  older_open_projects: any[];
}>> {
  return apiFetch("/api/eod-today", { method: "POST", body: { date: date || "" } });
}

export async function listEmployees(): Promise<ApiResult<{ employees: { id: string; name: string; employee_id: string }[] }>> {
  return apiFetch("/api/employees-list", { method: "POST", body: {} });
}

// -------------------- Shift Log --------------------

export async function addShiftLogEntry(note: string): Promise<ApiResult<{ entry: any }>> {
  return apiFetch("/api/shift-log-add", { method: "POST", body: { note } });
}

export async function listShiftLogEntries(): Promise<ApiResult<{ entries: any[] }>> {
  return apiFetch("/api/shift-log-list", { method: "POST", body: {} });
}

// -------------------- Assignment --------------------

export async function assignTicket(id: string, assigned_to: string | null): Promise<ApiResult<{}>> {
  return apiFetch("/api/tickets-assign", { method: "POST", body: { id, assigned_to } });
}

export async function assignProject(id: string, assigned_to: string | null): Promise<ApiResult<{}>> {
  return apiFetch("/api/projects-assign", { method: "POST", body: { id, assigned_to } });
}

// -------------------- Schedule --------------------

export async function uploadSchedule(payload: {
  image_base64: string;
  content_type: string;
}): Promise<ApiResult<{ count: number; dates: string[]; entries: any[] }>> {
  return apiFetch("/api/schedule-upload", { method: "POST", body: payload });
}

export async function getTodaySchedule(): Promise<ApiResult<{ date: string; entries: { employee_name: string; shift_start: string | null; shift_end: string | null }[] }>> {
  return apiFetch("/api/schedule-today", { method: "POST", body: {} });
}

export async function getWeekSchedule(week_start?: string): Promise<ApiResult<{
  week_start: string;
  week_end: string;
  entries: { work_date: string; employee_name: string; shift_start: string | null; shift_end: string | null; all_shifts: string | null }[];
}>> {
  return apiFetch("/api/schedule-week", { method: "POST", body: { week_start: week_start || "" } });
}

// -------------------- BEO Events --------------------

export async function uploadBeo(payload: { pdf_base64: string; filename: string }): Promise<ApiResult<{ event: any }>> {
  return apiFetch("/api/beo-upload", { method: "POST", body: payload });
}

export async function listBeoEvents(month?: string): Promise<ApiResult<{ events: any[] }>> {
  return apiFetch("/api/beo-list", { method: "POST", body: { month: month || "" } });
}

export async function completeBeoAction(beo_id: string, action_type: "setup" | "strike"): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-action", { method: "POST", body: { beo_id, action_type } });
}

export async function uploadBeoPhoto(payload: { beo_id: string; image_base64: string; content_type: string }): Promise<ApiResult<{ public_url: string }>> {
  return apiFetch("/api/beo-photo-upload", { method: "POST", body: payload });
}

export async function getTodayBeo(): Promise<ApiResult<{ today: string; events: any[] }>> {
  return apiFetch("/api/beo-today", { method: "POST", body: {} });
}

export async function getBeoEvent(beo_id: string): Promise<ApiResult<{ event: any }>> {
  return apiFetch("/api/beo-get", { method: "POST", body: { beo_id } });
}

export async function deleteBeoEvent(beo_id: string, reason: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-delete", { method: "POST", body: { beo_id, reason } });
}

export async function listDeletedBeoEvents(): Promise<ApiResult<{ events: any[] }>> {
  return apiFetch("/api/beo-list", { method: "POST", body: { include_deleted: true } });
}

export async function restoreBeoEvent(beo_id: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/beo-restore", { method: "POST", body: { beo_id } });
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

export async function scheduleUpdateEntry(payload: { action: "upsert" | "delete"; work_date: string; employee_name: string; shift_start?: string; shift_end?: string }): Promise<ApiResult<{}>> {
  return apiFetch("/api/schedule-update", { method: "POST", body: payload });
}

// -------------------- Procedures --------------------
export async function listProcedures(): Promise<ApiResult<{ procedures: any[] }>> {
  return apiFetch("/api/procedures-list", { method: "POST", body: {} });
}
export async function getProcedure(id: string): Promise<ApiResult<{ procedure: any; steps: any[] }>> {
  return apiFetch("/api/procedures-get", { method: "POST", body: { id } });
}
export async function saveProcedure(payload: { id?: string; title: string; category: string; visibility: string; steps: any[] }): Promise<ApiResult<{ id: string }>> {
  return apiFetch("/api/procedures-save", { method: "POST", body: payload });
}
export async function deleteProcedure(id: string): Promise<ApiResult<{}>> {
  return apiFetch("/api/procedures-delete", { method: "POST", body: { id } });
}
export async function uploadProcedurePhoto(payload: { image_base64: string; content_type: string }): Promise<ApiResult<{ photo_url: string; photo_path: string }>> {
  return apiFetch("/api/procedures-photo-upload", { method: "POST", body: payload });
}

export async function showTechRegister(payload: { code: string; name: string; employee_id: string; email: string; pin: string; pin_confirm: string }): Promise<ApiResult<{ message: string }>> {
  return apiFetch("/api/showtech-register", { method: "POST", body: payload });
}

export async function getEnrollmentCode(): Promise<ApiResult<{ code: string }>> {
  return apiFetch("/api/showtech-enrollment-code", { method: "POST", body: {} });
}

export async function askElijah(question: string): Promise<ApiResult<{
  answer: string;
  cited_tickets: { id: string; title: string; location: string }[];
  cited_projects: { id: string; title: string; location: string }[];
  context_found: boolean;
}>> {
  return apiFetch("/api/ask-elijah", { method: "POST", body: { question } });
}

export async function getElijahHistory(params: { page?: number; employee_id?: string; after_dark?: boolean | null; search?: string }): Promise<ApiResult<{ conversations: any[]; total: number; page: number; pages: number }>> {
  return apiFetch("/api/elijah-history", { method: "POST", body: params });
}

// -------------------- Review Schedule --------------------
export async function getReviewSchedule(week: string): Promise<ApiResult<{ reviews: any[] }>> {
  return apiFetch<{ reviews: any[] }>(`/api/review-schedule?week=${week}`, { method: "GET" });
}

export async function getItemReviews(itemId: string): Promise<ApiResult<{ reviews: any[] }>> {
  return apiFetch<{ reviews: any[] }>(`/api/review-schedule?item_id=${itemId}`, { method: "GET" });
}

export async function createReview(payload: {
  item_type: "ticket" | "project";
  item_id: string;
  item_title: string;
  review_date: string;
  note?: string;
}): Promise<ApiResult<{ review: any }>> {
  return apiFetch<{ review: any }>("/api/review-schedule", { method: "POST", body: payload });
}

export async function updateReview(id: string, updates: {
  review_date?: string;
  note?: string | undefined;
  completed?: boolean;
}): Promise<ApiResult<{ review: any }>> {
  return apiFetch<{ review: any }>("/api/review-schedule", { method: "PATCH", body: { id, ...updates } });
}

export async function deleteReview(id: string): Promise<ApiResult<{}>> {
  return apiFetch<{}>(`/api/review-schedule?id=${id}`, { method: "DELETE" });
}

// -------------------- User Preferences --------------------
export async function loadUserPreferences(): Promise<ApiResult<{ preferences: any }>> {
  return apiFetch<{ preferences: any }>("/api/user-preferences", { method: "GET" });
}

export async function saveUserPreferences(preferences: Record<string, any>): Promise<ApiResult<{ preferences: any }>> {
  return apiFetch<{ preferences: any }>("/api/user-preferences", { method: "POST", body: { preferences } });
}
