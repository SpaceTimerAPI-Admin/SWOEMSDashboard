import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const id = event.queryStringParameters?.id;
    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();

    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select(`
        id, title, location, details, status, created_at, sla_due_at, sla_minutes,
        created_by,
        employees!tickets_created_by_fkey(name)
      `)
      .eq("id", id)
      .maybeSingle();

    if (tErr || !ticket) return json({ ok: false, error: "Ticket not found" }, 404);

    const { data: comments, error: cErr } = await supabase
      .from("ticket_comments")
      .select(`
        id, ticket_id, employee_id, comment, status_change, created_at,
        employees!ticket_comments_employee_id_fkey(name)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (cErr) return json({ ok: false, error: cErr.message }, 500);

    return json({
      ok: true,
      ticket: {
        ...ticket,
        created_by_name: (ticket as any).employees?.name || "Unknown",
      },
      comments: (comments || []).map((c: any) => ({
        ...c,
        employee_name: c.employees?.name || "Unknown",
      })),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
