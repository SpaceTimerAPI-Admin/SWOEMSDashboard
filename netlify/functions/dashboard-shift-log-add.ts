/**
 * POST /api/dashboard-shift-log-add
 * Public endpoint — no auth required.
 * Adds a shift log entry attributed to "EMS Shop Dashboard".
 * Uses the first admin employee as the FK reference (NOT NULL constraint)
 * but overrides the display name via the display_name column.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json } from "./_shared";

const DASHBOARD_NAME = "EMS Shop Dashboard";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const note = String(body.note || "").trim();
    if (!note) return badRequest("Note is required");

    const supabase = supabaseAdmin();

    // Get first active admin as the FK reference
    const { data: adminEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!adminEmp) return json({ ok: false, error: "No admin employee found" }, 500);

    // Try inserting with display_name column first
    let insertData: any = { employee_id: adminEmp.id, note, display_name: DASHBOARD_NAME };
    let { data, error } = await supabase
      .from("shift_log_entries")
      .insert(insertData)
      .select("id, note, created_at, employee_id")
      .single();

    // If display_name column doesn't exist yet, fall back without it
    if (error && error.message.includes("display_name")) {
      const fallback = await supabase
        .from("shift_log_entries")
        .insert({ employee_id: adminEmp.id, note })
        .select("id, note, created_at, employee_id")
        .single();
      data  = fallback.data;
      error = fallback.error;
    }

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({
      ok: true,
      entry: {
        id: data.id,
        note: data.note,
        created_at: data.created_at,
        employee_name: DASHBOARD_NAME,
        employee_role: "ems",
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
