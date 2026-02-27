import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./_supabase";
import { json, badRequest, methodNotAllowed, requireEnv } from "./_shared";

// Resets a user's PIN and emails them a temporary PIN.
// POST { employee_id: string }
// Requires: RESEND_API_KEY, RESEND_FROM_EMAIL

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const { employee_id } = JSON.parse(event.body || "{}") as {
      employee_id?: string;
    };

    if (!employee_id) return badRequest("employee_id required");

    const resendKey = requireEnv("RESEND_API_KEY");
    const from = requireEnv("RESEND_FROM_EMAIL");

    const sb = supabaseAdmin();

    const { data: employee, error: empErr } = await sb
      .from("employees")
      .select("employee_id, email, name")
      .eq("employee_id", employee_id)
      .maybeSingle();

    if (empErr) throw empErr;
    if (!employee?.email) return badRequest("Employee not found");

    // 4-digit temporary PIN
    const tmpPin = String(Math.floor(1000 + Math.random() * 9000));
    const pin_hash = await bcrypt.hash(tmpPin, 10);

    const { error: updErr } = await sb
      .from("employees")
      .update({ pin_hash })
      .eq("employee_id", employee_id);

    if (updErr) throw updErr;

    const subject = "Your SWOEMS PIN was reset";
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.5">
        <h2 style="margin:0 0 12px">PIN reset</h2>
        <p style="margin:0 0 12px">Hi ${employee.name || "there"},</p>
        <p style="margin:0 0 12px">Your temporary PIN is:</p>
        <div style="font-size:28px; font-weight:700; letter-spacing:2px; margin:10px 0 18px">${tmpPin}</div>
        <p style="margin:0 0 12px">Log in with this PIN. You can reset it again any time from the login screen.</p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: employee.email, subject, html }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Resend failed: ${resp.status} ${txt}`);
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
