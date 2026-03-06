import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { badRequest, getIp, json, randomToken, sha256Hex, unauthorized } from "./_shared";

const MAX_ATTEMPTS_10MIN = 8;

function normId(s: string) {
  return String(s || "").trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = event.body ? JSON.parse(event.body) : {};
    const employee_id = normId(body.employee_id);
    const pin = String(body.pin || "").trim();

    if (!employee_id) return badRequest("Employee ID required");
    if (!/^\d{4}$/.test(pin)) return badRequest("PIN must be 4 digits");

    const supabase = supabaseAdmin();
    const ip = getIp(event);
    const ua = event.headers?.["user-agent"] || null;

    // Rate limit by employee_id over last 10 minutes
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: attempts } = await supabase
      .from("login_attempts")
      .select("id, success")
      .eq("employee_id_text", employee_id)
      .gte("created_at", since);

    const recentFails = (attempts || []).filter((a: any) => !a.success).length;
    if (recentFails >= MAX_ATTEMPTS_10MIN) {
      // log as fail (locked)
      await supabase.from("login_attempts").insert({
        employee_id_text: employee_id,
        success: false,
        ip,
        user_agent: ua,
      });
      return unauthorized("Too many attempts. Try again later.");
    }

    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, employee_id, name, email, pin_hash, is_active")
      .eq("employee_id", employee_id)
      .limit(1)
      .maybeSingle();

    if (empErr || !emp || !emp.is_active) {
      await supabase.from("login_attempts").insert({
        employee_id_text: employee_id,
        success: false,
        ip,
        user_agent: ua,
      });
      return unauthorized("Invalid Employee ID or PIN");
    }

    const ok = await bcrypt.compare(pin, emp.pin_hash);
    await supabase.from("login_attempts").insert({
      employee_id_text: employee_id,
      success: ok,
      ip,
      user_agent: ua,
    });

    if (!ok) return unauthorized("Invalid Employee ID or PIN");

    // Create a session token (bearer); store only hash in DB
    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h

    // Optional: prune old sessions for this employee
    await supabase.from("sessions").delete().eq("employee_id", emp.id).lt("expires_at", new Date().toISOString());

    const { error: sErr } = await supabase.from("sessions").insert({
      employee_id: emp.id,
      session_token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (sErr) return json({ ok: false, error: "Could not create session" }, 500);

    return json({
      ok: true,
      token,
      expires_at: expiresAt,
      employee: { id: emp.id, employee_id: emp.employee_id, name: emp.name, email: emp.email },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
