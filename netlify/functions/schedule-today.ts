/**
 * GET /api/schedule-today
 * Returns today's shift entries in Eastern Time.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

const TZ = "America/New_York";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST")
      return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("schedule_entries")
      .select("employee_name, shift_start, shift_end")
      .eq("work_date", today)
      .order("shift_start", { ascending: true, nullsFirst: false });

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, date: today, entries: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
