import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    // Support both GET (preferred) and POST (backwards-compat with older clients)
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const supabase = supabaseAdmin();

    let includeClosed = (event.queryStringParameters?.includeClosed || "") === "1";
    if (event.httpMethod === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (typeof body?.includeClosed === "boolean") includeClosed = body.includeClosed;
        if (body?.includeClosed === 1 || body?.includeClosed === "1") includeClosed = true;
      } catch {
        // ignore
      }
    }

    let q = supabase
      .from("projects")
      .select(`
        id, title, location, details, status, created_at, sla_due_at, sla_days,
        created_by, source_ticket_id,
        employees!projects_created_by_fkey(name)
      `)
      .order("sla_due_at", { ascending: true });

    if (!includeClosed) q = q.neq("status", "closed");

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    const now = Date.now();
    const items = (data || []).map((p: any) => {
      const due = new Date(p.sla_due_at).getTime();
      const msLeft = due - now;
      return {
        ...p,
        created_by_name: p.employees?.name || "Unknown",
        ms_left: msLeft,
        is_overdue: msLeft < 0,
      };
    });

    items.sort((a: any, b: any) => {
      const ao = a.is_overdue ? 0 : 1;
      const bo = b.is_overdue ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.ms_left - b.ms_left;
    });

    return json({ ok: true, projects: items });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
