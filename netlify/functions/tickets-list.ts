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

    // Newer clients send ?includeClosed=1 via GET. Older clients may POST { includeClosed: true }.
    let includeClosed = (event.queryStringParameters?.includeClosed || "") === "1";
    if (event.httpMethod === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (typeof body?.includeClosed === "boolean") includeClosed = body.includeClosed;
        if (body?.includeClosed === 1 || body?.includeClosed === "1") includeClosed = true;
      } catch {
        // ignore bad JSON
      }
    }

    const role = (session.employee as any).role || "ems";

    let q = supabase
      .from("tickets")
      .select(`
        id, title, location, details, status, tag, created_at, sla_due_at, sla_minutes,
        created_by, assigned_to, assigned_to_show_tech,
        employees!tickets_created_by_fkey(name, role),
        assignee:employees!tickets_assigned_to_fkey(name, role)
      `)
      .order("sla_due_at", { ascending: true });

    if (!includeClosed) q = q.eq("status", "open");

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    const now = Date.now();
    let items = (data || []).map((t: any) => ({
      ...t,
      created_by_name: t.employees?.name || "Unknown",
      created_by_role: t.employees?.role || "ems",
      assigned_to_name: (t as any).assignee?.name || null,
      assigned_to_role: (t as any).assignee?.role || null,
      ms_left: new Date(t.sla_due_at).getTime() - now,
      is_overdue: new Date(t.sla_due_at).getTime() - now < 0,
    }));

    // Show Tech: only see tickets created by show_tech users OR assigned to show_tech group
    if (role === "show_tech") {
      items = items.filter((t: any) =>
        t.created_by_role === "show_tech" || t.assigned_to_show_tech === true
      );
    }

    // overdue first, then due soonest
    items.sort((a: any, b: any) => {
      const ao = a.is_overdue ? 0 : 1;
      const bo = b.is_overdue ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.ms_left - b.ms_left;
    });

    return json({ ok: true, tickets: items });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
