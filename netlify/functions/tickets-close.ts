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
    const id = String(body.id || body.ticket_id || "").trim();
    const note = String(body.comment || "").trim();

    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();
    const now = new Date().toISOString();

    // Fetch for nicer notifications (optional)
    const { data: t } = await supabase.from("tickets").select("id, title, location").eq("id", id).maybeSingle();

    const { error } = await supabase
      .from("tickets")
      .update({
        status: "closed",
        closed_at: now,
        closed_by: session.employee.id,
      })
      .eq("id", id);

    if (error) return json({ ok: false, error: error.message }, 500);

    if (note) {
      await supabase.from("ticket_comments").insert({
        ticket_id: id,
        employee_id: session.employee.id,
        comment: note,
        status_change: "closed",
      });
    }

    try {
      const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
      const link = base ? `${base}/tickets/${id}` : "";
      const title = t?.title ? `${t.title}${t.location ? ` @ ${t.location}` : ""}` : `Ticket ${id}`;
      await postGroupMe(`✅ Closed: ${title} — by ${session.employee.name}${link ? ` — ${link}` : ""}`);
    } catch {}

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
