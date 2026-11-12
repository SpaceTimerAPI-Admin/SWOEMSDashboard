/**
 * GET /api/fountain-ack-get
 * Returns today's fountain acknowledgment (if any) for the calling user's business day.
 * Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { todayBusinessDay, businessDayRange } from "./_eod-day";

export const handler: Handler = async (event) => {
  try {
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();
    const { start, end } = businessDayRange(day);

    const { data, error } = await supabase
      .from("fountain_acknowledgments")
      .select("id, employee_id_text, employee_name, acked_at, business_day, lat, lon, bay_side_status, bay_side_note, lakeside_status, lakeside_note")
      .gte("acked_at", start)
      .lte("acked_at", end)
      .order("acked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, ack: data || null });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
