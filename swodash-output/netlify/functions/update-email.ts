import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const email = String(body.email || "").trim().toLowerCase();

    if (!email) return badRequest("Email is required.");
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Invalid email address.");

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("employees")
      .update({ email })
      .eq("id", session.employee.id);

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, email });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
