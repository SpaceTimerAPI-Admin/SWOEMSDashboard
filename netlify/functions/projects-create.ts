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
    const tag = String(body.tag || "").trim();
    const sla_days = body.sla_days ? Number(body.sla_days) : 14;

    if (!title) return badRequest("Title required");
    if (!location) return badRequest("Location required");
    if (!details) return badRequest("Details required");
    if (!Number.isFinite(sla_days) || sla_days <= 0 || sla_days > 365) return badRequest("Invalid SLA days");

    const created_at = new Date().toISOString();
    const sla_due_at = new Date(Date.now() + sla_days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        title,
        location,
        details,
        status: "open",
        created_by: session.employee.id,
        created_at,
        sla_days,
        sla_due_at,
        source_ticket_id: null,
      })
      .select("id, title, location, created_at, sla_due_at")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    try {
      const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
      const link = base ? `${base}/projects/${data.id}` : "";
      const msg = `📁 Project: ${title} @ ${location} — created by ${session.employee.name} — SLA ${sla_days}d${link ? ` — ${link}` : ""}`;
      await postGroupMe(msg);
    } catch {}

    return json({ ok: true, project: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
