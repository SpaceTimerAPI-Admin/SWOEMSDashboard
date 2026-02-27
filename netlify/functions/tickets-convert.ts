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
    const ticket_id = String(body.ticket_id || body.id || "").trim();
    if (!ticket_id) return badRequest("ticket_id required");

    const supabase = supabaseAdmin();

    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select("id, title, location, details")
      .eq("id", ticket_id)
      .maybeSingle();

    if (tErr || !ticket) return json({ ok: false, error: "Ticket not found" }, 404);

    const sla_days = 14;
    const sla_due_at = new Date(Date.now() + sla_days * 24 * 60 * 60 * 1000).toISOString();

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        title: ticket.title,
        location: ticket.location,
        details: ticket.details,
        status: "open",
        created_by: session.employee.id,
        created_at: new Date().toISOString(),
        sla_days,
        sla_due_at,
        source_ticket_id: ticket.id,
      })
      .select("id")
      .single();

    if (pErr) return json({ ok: false, error: pErr.message }, 500);

    // Mark ticket as converted so it no longer appears in the Tickets list
    await supabase.from("tickets").update({ status: "converted" }).eq("id", ticket.id);

    await supabase.from("ticket_comments").insert({
      ticket_id: ticket.id,
      employee_id: session.employee.id,
      comment: `Converted to project ${project.id}`,
      status_change: null,
    });

    try {
      const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
      const tLink = base ? `${base}/tickets/${ticket.id}` : "";
      const pLink = base ? `${base}/projects/${project.id}` : "";
      const links = [tLink && `Ticket: ${tLink}`, pLink && `Project: ${pLink}`].filter(Boolean).join(" — ");
      await postGroupMe(`📁 Converted: ${ticket.title} @ ${ticket.location} — by ${session.employee.name}${links ? ` — ${links}` : ""}`);
    } catch {}

    return json({ ok: true, project_id: project.id });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
