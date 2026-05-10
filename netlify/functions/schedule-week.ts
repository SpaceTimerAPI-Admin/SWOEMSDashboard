/**
 * POST /api/schedule-week
 * Body: { week_start?: string } — YYYY-MM-DD of the Monday to show.
 * Returns all schedule_entries for that 7-day week.
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

    const body = event.body ? JSON.parse(event.body) : {};

    // Determine the week start — default to the most recent Sunday
    let weekStart: string;
    if (body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)) {
      weekStart = body.week_start;
    } else {
      // Find the Sunday of the current ET week
      const now = new Date();
      const todayET = now.toLocaleDateString("en-CA", { timeZone: TZ });
      const d = new Date(todayET + "T12:00:00");
      // Go back to Sunday (day 0)
      d.setDate(d.getDate() - d.getDay());
      weekStart = d.toLocaleDateString("en-CA", { timeZone: TZ });
    }

    // 7-day window: weekStart through weekStart + 6
    const start = new Date(weekStart + "T00:00:00");
    const end = new Date(weekStart + "T00:00:00");
    end.setDate(end.getDate() + 6);
    const endStr = end.toLocaleDateString("en-CA");

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("schedule_entries")
      .select("work_date, employee_name, shift_start, shift_end, all_shifts")
      .gte("work_date", weekStart)
      .lte("work_date", endStr)
      .order("work_date", { ascending: true })
      .order("employee_name", { ascending: true });

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, week_start: weekStart, week_end: endStr, entries: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
