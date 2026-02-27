import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

function normId(s: string) {
  return String(s || "").trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = event.body ? JSON.parse(event.body) : {};
    const employee_id = normId(body.employee_id);
    const admin_code = String(body.admin_code || body.code || "").trim();
    const new_pin = String(body.new_pin || body.pin || "").trim();

    if (!employee_id) return badRequest("Employee ID required");
    if (!code) return badRequest("Enrollment code required");
    if (!/^\d{4}$/.test(new_pin)) return badRequest("PIN must be 4 digits");

    const expected = String(process.env.PIN_RESET_ADMIN_CODE || "").trim();
    if (!expected) return unauthorized("Admin reset code not configured");
    if (admin_code !== expected) return unauthorized("Invalid admin reset code");

    const supabase = supabaseAdmin();

    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, employee_id, is_active")
      .eq("employee_id", employee_id)
      .limit(1)
      .maybeSingle();

    if (empErr || !emp) return unauthorized("Employee not found");
    if (!emp.is_active) return unauthorized("Employee is inactive");

    const pin_hash = await bcrypt.hash(new_pin, 10);

    const { error: upErr } = await supabase.from("employees").update({ pin_hash }).eq("id", emp.id);
    if (upErr) return json({ ok: false, error: "Could not reset PIN" }, 500);

    // Optional: revoke existing sessions for this employee so they must log in again with the new PIN
    await supabase.from("sessions").delete().eq("employee_id", emp.id);

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
