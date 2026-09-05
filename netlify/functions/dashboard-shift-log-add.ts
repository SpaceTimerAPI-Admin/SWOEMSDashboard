/**
 * POST /api/dashboard-shift-log-add
 * Public endpoint — no auth required.
 * Adds a shift log entry attributed to "EMS Shop Dashboard".
 * Uses the first admin employee as the FK reference.
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

    // Look up a system employee to use as the FK — prefer one named "EMS Shop Dashboard",
    // fall back to first active admin
    let { data: sysEmp } = await supabase
      .from("employees")
      .select("id")
      .ilike("name", "%dashboard%")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!sysEmp) {
      const { data: adminEmp } = await supabase
        .from("employees")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      sysEmp = adminEmp;
    }

    if (!sysEmp) return json({ ok: false, error: "No system employee found" }, 500);

    const { data, error } = await supabase
      .from("shift_log_entries")
      .insert({ employee_id: sysEmp.id, note })
      .select("id, note, created_at, employee_id")
      .single();

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
