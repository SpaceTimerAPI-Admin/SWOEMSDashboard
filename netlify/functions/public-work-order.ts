/**
 * Public Work Order submission — no auth required.
 * POST /api/public-work-order
 *
 * Creates a ticket with SLA of 3 days (4320 minutes), sends GroupMe alert
 * and email to the fixed notification list + submitter.
 *
 * For photo upload: client first calls POST /api/public-work-order-photo
 * to get a signed URL, uploads directly to Supabase Storage, then
 * includes the storage_path in this request.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json, badRequest } from "./_shared";
import { postGroupMe } from "./_groupme";

const SITE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");
const SLA_MINUTES = 3 * 24 * 60; // 3 days

// Fixed notification list
const NOTIFY_EMAILS = [
  "Branden.Tolley@seaworld.com",
  "Andy.Osborne@buschgardens.com",
  "ADAM.CLARK@seaworld.com",
  "Elijah.Richardson-Grant@seaworld.com",
  "Anthony.McHugh@seaworld.com",
  "Daniel.Merrick@seaworld.com",
];

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function buildEmail(opts: {
  firstName: string; lastName: string; email: string; department: string;
  description: string; photoUrl?: string; ticketId: string; ticketLink: string;
}): string {
  const { firstName, lastName, email, department, description, photoUrl, ticketLink } = opts;
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px 48px;">

  <div style="text-align:center;margin-bottom:24px;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;">SeaWorld Entertainment Maintenance</div>
    <h1 style="margin:0;font-size:22px;color:#e5e7eb;font-weight:800;">
      🔧 External Work Order
    </h1>
    <div style="font-size:13px;color:#6b7280;margin-top:4px;">Submitted via public portal</div>
  </div>

  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:20px;margin-bottom:16px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Submitter</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af;width:110px;">Name</td><td style="font-size:13px;color:#e5e7eb;font-weight:600;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af;">Email</td><td style="font-size:13px;color:#e5e7eb;">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#9ca3af;">Department</td><td style="font-size:13px;color:#e5e7eb;">${escapeHtml(department)}</td></tr>
    </table>
  </div>

  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:20px;margin-bottom:16px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Description</div>
    <div style="font-size:14px;color:#e5e7eb;line-height:1.6;white-space:pre-wrap;">${escapeHtml(description)}</div>
  </div>

  ${photoUrl ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:16px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Attached Photo</div>
    <img src="${photoUrl}" alt="Work order photo" style="width:100%;border-radius:8px;display:block;" />
  </div>` : ""}

  <div style="text-align:center;margin-top:24px;">
    <a href="${escapeHtml(ticketLink)}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;">
      View Ticket in SWOEMS →
    </a>
  </div>

  <div style="font-size:11px;color:#374151;text-align:center;margin-top:20px;">
    SWOEMS · SeaWorld Entertainment Maintenance System
  </div>
</div></body></html>`;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const firstName  = String(body.first_name  || "").trim();
    const lastName   = String(body.last_name   || "").trim();
    const email      = String(body.email       || "").trim().toLowerCase();
    const department = String(body.department  || "").trim();
    const description = String(body.description || "").trim();
    const storagePath = String(body.storage_path || "").trim() || null;

    // Validate
    if (!firstName)   return badRequest("First name required");
    if (!lastName)    return badRequest("Last name required");
    if (!email || !email.includes("@")) return badRequest("Valid email required");
    if (!department)  return badRequest("Department required");
    if (!description) return badRequest("Description required");

    const supabase = supabaseAdmin();

    // Look up a system/bot employee to use as created_by
    // Use the first admin account as the creator
    const { data: botEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!botEmp) return json({ ok: false, error: "System configuration error" }, 500);

    const created_at = new Date().toISOString();
    const sla_due_at = new Date(Date.now() + SLA_MINUTES * 60 * 1000).toISOString();
    const title = `[External] Work order from ${firstName} ${lastName} (${department})`;

    // Create ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        title,
        location: department,
        details: description,
        tag: "Misc",
        status: "open",
        created_by: botEmp.id,
        created_at,
        sla_minutes: SLA_MINUTES,
        sla_due_at,
        assigned_to: null,
        assigned_to_show_tech: false,
      })
      .select("id, title")
      .single();

    if (ticketErr || !ticket) return json({ ok: false, error: ticketErr?.message || "Failed to create ticket" }, 500);

    const ticketLink = `${SITE_URL}/tickets/${ticket.id}`;

    // Attach photo if provided
    let photoUrl: string | undefined;
    if (storagePath) {
      const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
      photoUrl = base ? `${base}/storage/v1/object/public/ticket-photos/${storagePath}` : undefined;

      if (photoUrl) {
        await supabase.from("ticket_photos").insert({
          ticket_id: ticket.id,
          storage_path: storagePath,
          public_url: photoUrl,
          uploaded_by: botEmp.id,
        });
      }
    }

    // Add submitter info as first comment
    await supabase.from("ticket_comments").insert({
      ticket_id: ticket.id,
      employee_id: botEmp.id,
      comment: `📋 External submission from ${firstName} ${lastName}\n📧 ${email}\n🏢 ${department}`,
    });

    // GroupMe alert
    try {
      const lines = [
        `🔧 External Work Order`,
        `👤 ${firstName} ${lastName} — ${department}`,
        `📝 ${description.length > 120 ? description.slice(0, 117) + "…" : description}`,
        `🔗 ${ticketLink}`,
      ];
      await postGroupMe(lines.join("\n"));
    } catch (e) {
      console.error("[public-work-order] GroupMe error:", e);
    }

    // Email notification
    try {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL;
      if (apiKey && from) {
        const allRecipients = [...NOTIFY_EMAILS, email].filter(Boolean);
        const html = buildEmail({ firstName, lastName, email, department, description, photoUrl, ticketId: ticket.id, ticketLink });
        const subject = `🔧 External Work Order — ${firstName} ${lastName} (${department})`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: allRecipients, subject, html }),
        });
      }
    } catch (e) {
      console.error("[public-work-order] Email error:", e);
    }

    return json({ ok: true, ticket_id: ticket.id });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
