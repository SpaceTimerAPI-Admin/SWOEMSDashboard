import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const employee_id = String(body.employee_id || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const pin = String(body.pin || "").trim();
    const role = String(body.role || "ems").trim();

    if (!employee_id) return badRequest("Employee ID required");
    if (!name) return badRequest("Name required");
    if (!email || !email.includes("@")) return badRequest("Valid email required");
    if (!/^\d{4}$/.test(pin)) return badRequest("PIN must be 4 digits");
    if (!["admin", "ems", "show_tech"].includes(role)) return badRequest("Invalid role");

    const supabase = supabaseAdmin();
    const { data: existing } = await supabase
      .from("employees")
      .select("id")
      .or(`employee_id.eq.${employee_id},email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) return json({ ok: false, error: "Employee ID or email already exists" }, 409);

    const pin_hash = await bcrypt.hash(pin, 10);
    const { data, error } = await supabase
      .from("employees")
      .insert({ employee_id, name, email, pin_hash, role, is_active: true })
      .select("id, employee_id, name, email, role, is_active")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, employee: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
