/**
 * Scheduled: Every Monday and Thursday at 8 AM ET (12:00 UTC)
 * Sends overdue ticket alert to all active EMS + Admin employees who have emails.
 * Only fires if there are actually overdue tickets.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";
const SITE_URL = process.env.SITE_BASE_URL || "https://www.swoems.com";

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fmtDuration(ms: number): string {
  const totalMins = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function buildHtml(tickets: any[], now: Date, dateDisplay: string): string {
  const count = tickets.length;

  const ticketRows = tickets.map(t => {
    const overdueMs = now.getTime() - new Date(t.sla_due_at).getTime();
    const openedMs  = now.getTime() - new Date(t.created_at).getTime();
    const assignee  = t.assigned_to_show_tech
      ? "Show Tech"
      : t.assignee_name || "Unassigned";
    const comments: any[] = t.comments || [];

    const commentsHtml = comments.length === 0
      ? `<p style="margin:6px 0 0;color:#6b7280;font-size:13px;font-style:italic;">No updates yet.</p>`
      : comments.map((c: any) => `
          <div style="margin-top:8px;padding:8px 10px;background:#1e2030;border-radius:6px;border-left:3px solid #4b5563;">
            <div style="font-size:12px;color:#9ca3af;margin-bottom:3px;">${escapeHtml(c.employee_name)} · ${fmtDateTime(c.created_at)}</div>
            <div style="font-size:13px;color:#d1d5db;line-height:1.5;">${escapeHtml(c.note)}</div>
          </div>`).join("");

    return `
      <div style="background:#161827;border-radius:10px;padding:18px;margin-bottom:14px;border:1px solid #2d3147;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <a href="${SITE_URL}/tickets/${escapeHtml(t.id)}"
               style="font-size:16px;font-weight:700;color:#f87171;text-decoration:none;">
              🔴 ${escapeHtml(t.title)}
            </a>
            <div style="margin-top:5px;font-size:13px;color:#9ca3af;">
              📍 ${escapeHtml(t.location)}${t.tag ? ` &nbsp;·&nbsp; <span style="color:#c4b5fd;">${escapeHtml(t.tag)}</span>` : ""}
            </div>
          </td>
          <td align="right" style="white-space:nowrap;vertical-align:top;">
            <span style="background:#450a0a;color:#fca5a5;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #7f1d1d;">
              OVERDUE ${fmtDuration(overdueMs)}
            </span>
          </td>
        </tr></table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
          <tr>
            <td style="font-size:12px;color:#6b7280;width:50%;">
              <b style="color:#9ca3af;">Opened</b><br/>${fmtDateTime(t.created_at)}<br/>
              <span style="color:#6b7280;">(${fmtDuration(openedMs)} ago)</span>
            </td>
            <td style="font-size:12px;color:#6b7280;width:50%;">
              <b style="color:#9ca3af;">Assigned To</b><br/>
              <span style="color:#e5e7eb;">${escapeHtml(assignee)}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top:12px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:4px;">Updates</div>
          ${commentsHtml}
        </div>

        <div style="margin-top:12px;text-align:right;">
          <a href="${SITE_URL}/tickets/${escapeHtml(t.id)}"
             style="display:inline-block;background:#312e81;color:#c7d2fe;font-size:12px;font-weight:600;padding:6px 14px;border-radius:8px;text-decoration:none;border:1px solid #4338ca;">
            View Ticket →
          </a>
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px 48px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">SeaWorld Entertainment Maintenance</div>
      <h1 style="margin:0;font-size:24px;color:#f87171;font-weight:800;">⚠️ Overdue Ticket Alert</h1>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">${dateDisplay}</div>
    </div>

    <!-- Summary bar -->
    <div style="background:#1c1e2e;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;border:1px solid #2d3147;">
      <div style="font-size:32px;font-weight:800;color:#f87171;">${count}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:2px;">
        ticket${count !== 1 ? "s" : ""} past SLA deadline
      </div>
    </div>

    <!-- Tickets -->
    ${ticketRows}

    <!-- Footer -->
    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #1e2030;">
      <a href="${SITE_URL}/tickets" style="display:inline-block;background:#1e2030;color:#818cf8;font-size:13px;padding:10px 22px;border-radius:8px;text-decoration:none;border:1px solid #2d3147;">
        View All Tickets
      </a>
      <div style="font-size:11px;color:#374151;margin-top:14px;">
        SWOEMS · SeaWorld Entertainment Maintenance System
      </div>
    </div>

  </div>
</body>
</html>`;
}

export const handler: Handler = async () => {
  const supabase = supabaseAdmin();
  const now = new Date();

  try {
    // 1. Fetch all open overdue tickets with their comments
    const { data: tickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select(`
        id, title, location, tag, status, created_at, sla_due_at, sla_minutes,
        created_by, assigned_to, assigned_to_show_tech,
        assignee:employees!tickets_assigned_to_fkey(name),
        comments:ticket_comments(id, comment, created_at, employees!ticket_comments_employee_id_fkey(name))
      `)
      .eq("status", "open")
      .lt("sla_due_at", now.toISOString())
      .order("sla_due_at", { ascending: true });

    if (ticketsErr) {
      console.error("[overdue-alert] Tickets fetch error:", ticketsErr.message);
      return { statusCode: 500, body: ticketsErr.message };
    }

    if (!tickets || tickets.length === 0) {
      console.log("[overdue-alert] No overdue tickets — skipping email.");
      return { statusCode: 200, body: "No overdue tickets." };
    }

    // Shape data
    const shaped = tickets.map((t: any) => ({
      ...t,
      assignee_name: t.assignee?.name || null,
      comments: (t.comments || [])
        .map((c: any) => ({ ...c, employee_name: c.employees?.name || "Unknown", note: c.comment }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));

    // 2. Fetch all active EMS + Admin employees with email set
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, name, email, role")
      .eq("is_active", true)
      .in("role", ["ems", "admin"])
      .neq("email", "");

    if (empErr) {
      console.error("[overdue-alert] Employees fetch error:", empErr.message);
      return { statusCode: 500, body: empErr.message };
    }

    const recipients = (employees || []).map((e: any) => e.email).filter(Boolean);
    if (recipients.length === 0) {
      console.log("[overdue-alert] No recipients found.");
      return { statusCode: 200, body: "No recipients." };
    }

    // 3. Build email
    const dateDisplay = now.toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const html = buildHtml(shaped, now, dateDisplay);
    const subject = `⚠️ SWOEMS — ${tickets.length} Overdue Ticket${tickets.length !== 1 ? "s" : ""} · ${now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}`;

    // 4. Send via Resend
    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.error("[overdue-alert] Missing RESEND_API_KEY or RESEND_FROM_EMAIL");
      return { statusCode: 500, body: "Email not configured." };
    }

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("[overdue-alert] Resend error:", sendRes.status, errBody);
      return { statusCode: 500, body: `Resend error: ${sendRes.status}` };
    }

    console.log(`[overdue-alert] Sent to ${recipients.length} recipients — ${tickets.length} overdue tickets.`);
    return { statusCode: 200, body: `OK — ${tickets.length} tickets, ${recipients.length} recipients.` };

  } catch (e: any) {
    console.error("[overdue-alert] Uncaught error:", e?.message);
    return { statusCode: 500, body: e?.message || "Server error" };
  }
};
