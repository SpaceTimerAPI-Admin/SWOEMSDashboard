import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, serverError } from "./_shared";

function norm(s: string) {
  return String(s || "").trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const code = process.env.ENROLLMENT_CODE || "";
    const body = event.body ? JSON.parse(event.body) : {};
    const enrollment_code = norm(body.enrollment_code);

    if (!code) return serverError("Enrollment not configured");
    if (enrollment_code !== code) return json({ ok: false, error: "Invalid enrollment code" }, 401);

    const employee_id = norm(body.employee_id);
    const name = norm(body.name);
    const email = norm(body.email).toLowerCase();
    const pin = norm(body.pin);

    if (!employee_id) return badRequest("Employee ID required");
    if (!name) return badRequest("Name required");
    if (!email || !email.includes("@")) return badRequest("Valid email required");
    if (!/^\d{4}$/.test(pin)) return badRequest("PIN must be 4 digits");

    const supabase = supabaseAdmin();

    const { data: existing } = await supabase
      .from("employees")
      .select("id")
      .or(`employee_id.eq.${employee_id},email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) return json({ ok: false, error: "Employee already exists" }, 409);

    const pin_hash = await bcrypt.hash(pin, 10);

    const { data, error } = await supabase.from("employees").insert({
      employee_id,
      name,
      email,
      pin_hash,
      is_active: true,
    }).select("id, employee_id, name, email").single();

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, employee: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
