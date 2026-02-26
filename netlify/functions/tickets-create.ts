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
    const title = String(body.title || "").trim();
    const location = String(body.location || "").trim();
    const details = String(body.details || "").trim();
    const sla_minutes = body.sla_minutes ? Number(body.sla_minutes) : 60;

    if (!title) return badRequest("Title required");
    if (!location) return badRequest("Location required");
    if (!details) return badRequest("Details required");
    if (!Number.isFinite(sla_minutes) || sla_minutes <= 0 || sla_minutes > 24 * 60) {
      return badRequest("Invalid SLA minutes");
    }

    const created_at = new Date().toISOString();
    const sla_due_at = new Date(Date.now() + sla_minutes * 60 * 1000).toISOString();

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        title,
        location,
        details,
        status: "open",
        created_by: session.employee.id,
        created_at,
        sla_minutes,
        sla_due_at,
      })
      .select("id, title, location, created_at, sla_due_at")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    try {
      const msg = `🆕 Ticket: ${title} @ ${location} — logged by ${session.employee.name} — SLA ${sla_minutes}m`;
      await postGroupMe(msg);
    } catch {}

    return json({ ok: true, ticket: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
