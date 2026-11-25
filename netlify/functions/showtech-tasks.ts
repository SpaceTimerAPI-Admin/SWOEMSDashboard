/**
 * GET /api/showtech-tasks
 * Today's assigned Christmas tickets for the logged-in tech, whether each has had
 * an update added today, and who is on shift. Admins also get, per on-shift tech, how many
 * Christmas tickets they opened and closed that day. Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { loadTasks } from "./_showtech-tasks";
import { todayBusinessDay } from "./_eod-day";

export const handler: Handler = async (event) => {
  try {
    const session = await requireSession(event);
    if (!session) return unauthorized();
    const emp = session.employee as any;
    const isAdmin = emp.role === "admin";

    // Admins can look back at an earlier day (?day=YYYY-MM-DD) and see opened/closed counts.
    const asked = event.queryStringParameters?.day || "";
    const day = isAdmin && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : undefined;

    const data = await loadTasks(supabaseAdmin(), emp, { day, withActivity: isAdmin });
    return json({ ok: true, role: emp.role, today: todayBusinessDay(), ...data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
