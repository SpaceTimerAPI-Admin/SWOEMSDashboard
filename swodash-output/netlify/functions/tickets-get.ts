import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    // Support both GET (preferred) and POST (backwards-compat with older clients)
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const session = await requireSession(event);
    if (!session) return unauthorized();

    // Newer clients call /tickets-get?id=... via GET
    // Older clients may POST { id: "..." }
    let id = event.queryStringParameters?.id;
    if (!id && event.httpMethod === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (typeof body?.id === "string") id = body.id;
      } catch {
        // ignore
      }
    }
    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();

    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select(`
        id, title, location, details, tag, status, created_at, sla_due_at, sla_minutes,
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

    const { data: photos, error: pErr } = await supabase
      .from("ticket_photos")
      .select(
        "id, ticket_id, storage_path, public_url, created_at, uploaded_by, employees!ticket_photos_uploaded_by_fkey(name)"
      )
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (pErr) return json({ ok: false, error: pErr.message }, 500);

    return json({
      ok: true,
      ticket: {
        ...ticket,
        created_by_name: (ticket as any).employees?.name || "Unknown",
      },
      photos: (photos || []).map((p: any) => ({
        ...p,
        uploaded_by_name: p.employees?.name || "Unknown",
      })),
      comments: (comments || []).map((c: any) => ({
        ...c,
        employee_name: c.employees?.name || "Unknown",
      })),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
