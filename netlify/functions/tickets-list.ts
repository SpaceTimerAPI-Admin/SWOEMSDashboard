import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const supabase = supabaseAdmin();
    const includeClosed = (event.queryStringParameters?.includeClosed || "") === "1";

    let q = supabase
      .from("tickets")
      .select(`
        id, title, location, details, status, created_at, sla_due_at, sla_minutes,
        created_by,
        employees!tickets_created_by_fkey(name)
      `)
      .order("sla_due_at", { ascending: true });

    if (!includeClosed) q = q.neq("status", "closed");

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    const now = Date.now();
    const items = (data || []).map((t: any) => {
      const due = new Date(t.sla_due_at).getTime();
      const msLeft = due - now;
      return {
        ...t,
        created_by_name: t.employees?.name || "Unknown",
        ms_left: msLeft,
        is_overdue: msLeft < 0,
      };
    });

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
