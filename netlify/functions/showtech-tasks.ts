/**
 * GET /api/showtech-tasks
 * Today's assigned Christmas tickets for the logged-in tech, whether each has had
 * an update added today, and who is on shift. Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { loadTasks } from "./_showtech-tasks";

export const handler: Handler = async (event) => {
  try {
    const session = await requireSession(event);
    if (!session) return unauthorized();
    const emp = session.employee as any;
    const data = await loadTasks(supabaseAdmin(), emp);
    return json({ ok: true, role: emp.role, ...data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
