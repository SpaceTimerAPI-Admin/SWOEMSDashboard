/**
 * POST /api/showtech-register
 * Public endpoint — no auth required.
 * Creates a show_tech account if the enrollment code matches.
 */
import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return json({ ok: false, error: "Method not allowed" }, 405);

    const body = event.body ? JSON.parse(event.body) : {};
    const code        = String(body.code || "").trim();
    const name        = String(body.name || "").trim();
    const employee_id = String(body.employee_id || "").trim();
    const email       = String(body.email || "").trim().toLowerCase();
    const pin         = String(body.pin || "").trim();
    const pin_confirm = String(body.pin_confirm || "").trim();

    // Validate enrollment code
    const validCode = process.env.SHOW_TECH_ENROLLMENT_CODE || "";
    if (!validCode) return json({ ok: false, error: "Registration is not currently available." }, 403);
    if (code !== validCode) return json({ ok: false, error: "Invalid registration link. Please scan the QR code again." }, 403);

    // Validate fields
    if (!name) return badRequest("Full name is required.");
    if (!employee_id) return badRequest("Employee ID is required.");
    if (!email || !email.includes("@")) return badRequest("A valid email address is required.");
    if (!/^\d{4}$/.test(pin)) return badRequest("PIN must be exactly 4 digits.");
    if (pin !== pin_confirm) return badRequest("PINs do not match.");

    const supabase = supabaseAdmin();

    // Check for duplicates
    const { data: existing } = await supabase
      .from("employees")
      .select("id, employee_id, email")
      .or(`employee_id.eq.${employee_id},email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.employee_id === employee_id)
        return json({ ok: false, error: "An account with that Employee ID already exists." }, 409);
      return json({ ok: false, error: "An account with that email already exists." }, 409);
    }

    const pin_hash = await bcrypt.hash(pin, 10);

    const { error: insertErr } = await supabase
      .from("employees")
      .insert({ employee_id, name, email, pin_hash, role: "show_tech", is_active: true });

    if (insertErr) return json({ ok: false, error: insertErr.message }, 500);

    console.log(`[showtech-register] New show_tech account: ${name} (${employee_id})`);
    return json({ ok: true, message: "Account created! You can now log in." });

  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
