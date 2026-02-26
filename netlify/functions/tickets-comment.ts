import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";
import { postGroupMe } from "./_groupme";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const ticket_id = String(body.ticket_id || "").trim();
    const comment = String(body.comment || "").trim();

    if (!ticket_id) return badRequest("ticket_id required");
    if (!comment) return badRequest("comment required");

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id,
        employee_id: session.employee.id,
        comment,
        status_change: null,
      })
      .select("id, created_at")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    // no GroupMe on every comment (spam) - can change later

    return json({ ok: true, comment: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
