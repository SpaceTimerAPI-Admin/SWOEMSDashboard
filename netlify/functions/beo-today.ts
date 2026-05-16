/**
 * GET/POST /api/beo-today
 * Returns today's BEO events with actions and photos.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

const TZ = "America/New_York";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("beo_events")
      .select(`id, event_name, event_date, pdf_url,
        beo_actions(id, action_type, completed_at, employees!beo_actions_completed_by_fkey(name)),
        beo_photos(id, public_url)`)
      .eq("event_date", today)
      .is("deleted_at", null)
      .order("event_name");

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, today, events: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
