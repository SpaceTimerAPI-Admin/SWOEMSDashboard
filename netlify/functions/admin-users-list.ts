import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin") return json({ ok: false, error: "Forbidden" }, 403);

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_id, name, email, role, is_active, last_login_at, created_at")
      .order("name", { ascending: true });

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, employees: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
