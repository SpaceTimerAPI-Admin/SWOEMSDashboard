import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const TZ = "America/New_York";
const SITE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

async function sendAssignmentEmail(opts: {
  to: string; assigneeName: string; assignedByName: string;
  ticket: any; photos: any[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn("[tickets-assign] Missing RESEND env vars — skipping assignment email.");
    return;
  }

  const { ticket, photos, assigneeName, assignedByName } = opts;
  const ticketUrl = `${SITE_URL}/tickets/${ticket.id}`;

  const photosHtml = photos.length > 0 ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:8px;">Photos</div>
      <table cellpadding="0" cellspacing="0"><tr>
        ${photos.slice(0, 4).map((p: any) => `
          <td style="padding-right:8px;padding-bottom:8px;">
            <a href="${escapeHtml(p.public_url)}"><img src="${escapeHtml(p.public_url)}" width="120" height="120" style="border-radius:8px;object-fit:cover;display:block;" /></a>
          </td>`).join("")}
      </tr></table>
      ${photos.length > 4 ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">+ ${photos.length - 4} more — view on ticket page</div>` : ""}
    </div>` : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px 48px;">

    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">SeaWorld Entertainment Maintenance</div>
      <h1 style="margin:0;font-size:22px;color:#818cf8;font-weight:800;">🎫 You've Been Assigned a Ticket</h1>
    </div>

    <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:20px;margin-bottom:18px;">
      <div style="font-size:13px;color:#9ca3af;margin-bottom:10px;">
        <b style="color:#e5e7eb;">${escapeHtml(assignedByName)}</b> assigned this ticket to you.
      </div>

      <a href="${ticketUrl}" style="font-size:18px;font-weight:700;color:#c7d2fe;text-decoration:none;display:block;margin-bottom:6px;">
        ${escapeHtml(ticket.title || "Untitled Ticket")}
      </a>

      <div style="font-size:13px;color:#9ca3af;margin-bottom:14px;">
        📍 ${escapeHtml(ticket.location || "—")}
        ${ticket.tag ? `&nbsp;·&nbsp;<span style="color:#c4b5fd;">${escapeHtml(ticket.tag)}</span>` : ""}
      </div>

      ${ticket.details ? `
        <div style="background:#1e2030;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:4px;">Details</div>
          <div style="font-size:13px;color:#d1d5db;line-height:1.55;white-space:pre-wrap;">${escapeHtml(ticket.details)}</div>
        </div>` : ""}

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#6b7280;width:50%;">
            <b style="color:#9ca3af;">Opened</b><br/>${fmtDateTime(ticket.created_at)}
          </td>
          <td style="font-size:12px;color:#6b7280;width:50%;">
            <b style="color:#9ca3af;">SLA Due</b><br/>${ticket.sla_due_at ? fmtDateTime(ticket.sla_due_at) : "—"}
          </td>
        </tr>
      </table>

      ${photosHtml}

      <div style="margin-top:18px;text-align:center;">
        <a href="${ticketUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;padding:11px 28px;border-radius:10px;text-decoration:none;">
          View Ticket →
        </a>
      </div>
    </div>

    <div style="text-align:center;">
      <div style="font-size:11px;color:#374151;">
        SWOEMS · SeaWorld Entertainment Maintenance System
      </div>
    </div>

  </div>
</body>
</html>`;

  const subject = `🎫 Assigned: ${ticket.title || "New Ticket"}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [opts.to], subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[tickets-assign] Resend error:", res.status, err);
    }
  } catch (e: any) {
    console.error("[tickets-assign] Email send failed:", e?.message);
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const id = String(body.id || "").trim();
    const assigned_to_raw = body.assigned_to || null;
    if (!id) return badRequest("id required");

    const assign_to_show_tech = assigned_to_raw === "show_tech";
    const assigned_to = assign_to_show_tech ? null : assigned_to_raw;

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_to, assigned_to_show_tech: assign_to_show_tech })
      .eq("id", id);

    if (error) return json({ ok: false, error: error.message }, 500);

    // Send assignment email — only for EMS/Admin individual assignees, never Show Tech.
    // Awaited so the email completes before the serverless function exits.
    if (assigned_to) {
      try {
        const { data: assignee } = await supabase
          .from("employees")
          .select("id, name, email, role")
          .eq("id", assigned_to)
          .maybeSingle();

        if (assignee && assignee.role !== "show_tech" && assignee.email) {
          const { data: ticket } = await supabase
            .from("tickets")
            .select("id, title, location, tag, details, created_at, sla_due_at")
            .eq("id", id)
            .maybeSingle();

          if (ticket) {
            const { data: photos } = await supabase
              .from("ticket_photos")
              .select("public_url")
              .eq("ticket_id", id)
              .order("created_at", { ascending: true });

            await sendAssignmentEmail({
              to: assignee.email,
              assigneeName: assignee.name,
              assignedByName: session.employee.name,
              ticket,
              photos: photos || [],
            });
          }
        }
      } catch (e: any) {
        // Don't fail the assignment if the email fails — just log it
        console.error("[tickets-assign] Email error:", e?.message);
      }
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
