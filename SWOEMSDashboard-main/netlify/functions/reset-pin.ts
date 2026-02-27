import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { json, methodNotAllowed, requireEnv } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const ENROLLMENT_CODE = requireEnv("ENROLLMENT_CODE");

    const body = event.body ? JSON.parse(event.body) : {};
    const employee_id = String(body.employee_id || "").trim();
    const code = String(body.code || body.enrollment_code || "").trim();
    const pin = String(body.pin || "").trim();

    if (!employee_id) return json({ ok: false, error: "employee_id required" }, 400);
    if (!code) return json({ ok: false, error: "code required" }, 400);
    if (code !== ENROLLMENT_CODE) return json({ ok: false, error: "Invalid code" }, 401);
    if (!pin || pin.length < 4) return json({ ok: false, error: "PIN must be at least 4 digits" }, 400);

    // Make sure employee exists
    const existing = await supabaseAdmin.from("employees").select("id").eq("employee_id", employee_id).maybeSingle();
    if (existing.error) return json({ ok: false, error: existing.error.message }, 500);
    if (!existing.data) return json({ ok: false, error: "Employee not found" }, 404);

    const pin_hash = await bcrypt.hash(pin, 10);
    const upd = await supabaseAdmin.from("employees").update({ pin_hash }).eq("employee_id", employee_id);
    if (upd.error) return json({ ok: false, error: upd.error.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
