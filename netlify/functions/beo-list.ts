import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const month = String(body.month || "").trim();
    const include_deleted = body.include_deleted === true;

    const supabase = supabaseAdmin();
    let q = supabase
      .from("beo_events")
      .select(`id, event_name, event_date, pdf_url, uploaded_at, deleted_at, deleted_reason,
        beo_actions(id, action_type, completed_at, employees!beo_actions_completed_by_fkey(name)),
        beo_photos(id, public_url, uploaded_at)`)
      .order("event_date", { ascending: false });

    if (include_deleted) {
      q = q.not("deleted_at", "is", null);
    } else {
      q = q.is("deleted_at", null).order("event_date", { ascending: true });
    }

    if (month) {
      const start = `${month}-01`;
      const end = `${month}-31`;
      q = q.gte("event_date", start).lte("event_date", end);
    }

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, events: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
