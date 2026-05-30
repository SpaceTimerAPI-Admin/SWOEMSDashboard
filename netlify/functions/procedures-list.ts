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
    const role = (session.employee as any).role || "ems";

    const supabase = supabaseAdmin();
    let q = supabase
      .from("procedures")
      .select("id, title, category, visibility, step_count, created_at, employees!procedures_created_by_fkey(name)")
      .order("category").order("title");

    // Filter by visibility based on role
    if (role === "show_tech") {
      q = q.eq("visibility", "everyone");
    } else if (role === "ems") {
      q = q.in("visibility", ["ems", "everyone"]);
    }
    // admin sees all

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, procedures: (data || []).map((p: any) => ({
      ...p, created_by_name: p.employees?.name || "Unknown",
    })) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
