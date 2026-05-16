/**
 * POST /api/beo-get
 * Body: { beo_id }
 * Returns full event details including log.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const beo_id = String(body.beo_id || "").trim();
    if (!beo_id) return badRequest("beo_id required");

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("beo_events")
      .select(`
        id, event_name, event_date, pdf_url, uploaded_at, deleted_at, deleted_reason,
        beo_actions(id, action_type, completed_at, employees!beo_actions_completed_by_fkey(name)),
        beo_photos(id, public_url, uploaded_at),
        beo_log(id, action, note, created_at, employees!beo_log_employee_id_fkey(name))
      `)
      .eq("id", beo_id)
      .single();

    if (error || !data) return json({ ok: false, error: "Event not found" }, 404);

    // Sort log by created_at
    if (data.beo_log) {
      (data.beo_log as any[]).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return json({ ok: true, event: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
