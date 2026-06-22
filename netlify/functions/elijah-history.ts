/**
 * POST /api/elijah-history
 * Admin only. Returns paginated Elijah conversation logs with optional filters.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const page        = Math.max(1, Number(body.page || 1));
    const limit       = 20;
    const offset      = (page - 1) * limit;
    const employee_id = body.employee_id || null; // filter by specific person
    const after_dark  = body.after_dark === true ? true : body.after_dark === false ? false : null;
    const search      = String(body.search || "").trim(); // keyword search in question/answer

    const supabase = supabaseAdmin();

    let q = supabase
      .from("elijah_conversations")
      .select("id, employee_id, employee_name, question, answer, after_dark, context_found, cited_ticket_ids, cited_project_ids, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (employee_id) q = q.eq("employee_id", employee_id);
    if (after_dark !== null) q = q.eq("after_dark", after_dark);
    if (search) q = q.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({
      ok: true,
      conversations: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
