import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin") return json({ ok: false, error: "Forbidden — admin only" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const { action, work_date, employee_name, shift_start, shift_end, all_shifts } = body;

    if (!work_date || !/^\d{4}-\d{2}-\d{2}$/.test(work_date)) return badRequest("valid work_date required");
    if (!employee_name) return badRequest("employee_name required");
    if (!action || !["upsert","delete"].includes(action)) return badRequest("action must be upsert or delete");

    const supabase = supabaseAdmin();

    if (action === "delete") {
      await supabase.from("schedule_entries").delete()
        .eq("work_date", work_date).eq("employee_name", employee_name);
      return json({ ok: true });
    }

    // Upsert
    const { error } = await supabase.from("schedule_entries").upsert({
      work_date,
      employee_name,
      shift_start: shift_start || null,
      shift_end: shift_end || null,
      all_shifts: all_shifts || (shift_start && shift_end ? `${shift_start} - ${shift_end}` : null),
      uploaded_by: session.employee.id,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: "work_date,employee_name" });

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
