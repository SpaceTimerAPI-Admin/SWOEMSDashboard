import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, employee_id, role")
      .eq("is_active", true)
      .order("name");

    if (error) return json({ ok: false, error: error.message }, 500);

    // EMS assignment options: only ems and admin roles
    const emsOnly = (data || []).filter((e: any) => e.role === "ems" || e.role === "admin");

    return json({
      ok: true,
      employees: data || [],
      assignment_options: [
        { id: "show_tech", name: "Show Tech", role: "show_tech" },
        ...emsOnly,
      ],
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
