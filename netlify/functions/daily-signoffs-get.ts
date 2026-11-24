/**
 * GET /api/daily-signoffs-get
 * Returns today's status for every daily sign-off (Lake Fountains, Snow Moments)
 * plus the recent history of who signed each one and when. Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { todayBusinessDay, businessDayRange } from "./_eod-day";

const FOUNTAIN_COLS = "id, employee_id_text, employee_name, acked_at, business_day, lat, lon, bay_side_status, bay_side_note, lakeside_status, lakeside_note";
const SNOW_COLS     = "id, employee_id_text, employee_name, acked_at, business_day, lat, lon, status, note";
const HISTORY_ROWS  = 14;

export const handler: Handler = async (event) => {
  try {
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();
    const { start, end } = businessDayRange(day);

    const [fountainRes, snowRes] = await Promise.all([
      supabase.from("fountain_acknowledgments").select(FOUNTAIN_COLS)
        .order("acked_at", { ascending: false }).limit(HISTORY_ROWS),
      supabase.from("snow_acknowledgments").select(SNOW_COLS)
        .order("acked_at", { ascending: false }).limit(HISTORY_ROWS),
    ]);

    if (fountainRes.error) return json({ ok: false, error: fountainRes.error.message }, 500);

    const inRange = (r: any) => {
      const t = new Date(r.acked_at).getTime();
      return t >= new Date(start).getTime() && t <= new Date(end).getTime();
    };

    const fountainRows = fountainRes.data || [];
    const snowRows     = snowRes.data || [];

    return json({
      ok: true,
      business_day: day,
      fountain: fountainRows.find(inRange) || null,
      snow:     snowRows.find(inRange) || null,
      // If the snow table hasn't been created yet, say so instead of failing the whole page.
      snow_error: snowRes.error ? snowRes.error.message : null,
      history: {
        fountain: fountainRows,
        snow:     snowRows,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
