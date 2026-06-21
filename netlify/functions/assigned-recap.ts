/**
 * Scheduled: Every Wednesday at 8 AM ET (12:00 UTC)
 * Sends each EMS/Admin a personal recap of their currently open assigned tickets.
 * Show Tech assignees are excluded entirely (no emails sent to them, and tickets
 * assigned to the "Show Tech" group are not included in anyone's recap).
 * Skips anyone with zero open assigned tickets — no empty emails.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";
const SITE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtDuration(ms: number): string {
  const totalMins = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function buildHtml(name: string, tickets: any[], now: Date): string {
  const overdueCount = tickets.filter((t: any) => new Date(t.sla_due_at) < now).length;

  const rows = tickets.map((t: any) => {
    const isOverdue = new Date(t.sla_due_at) < now;
    const ageMs = now.getTime() - new Date(t.created_at).getTime();

    return `
      <div style="background:#161827;border-radius:10px;padding:16px;margin-bottom:12px;border:1px solid #2d3147;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <a href="${SITE_URL}/tickets/${escapeHtml(t.id)}"
               style="font-size:15px;font-weight:700;color:#c7d2fe;text-decoration:none;">
              ${escapeHtml(t.title)}
            </a>
            <div style="margin-top:4px;font-size:13px;color:#9ca3af;">
              📍 ${escapeHtml(t.location)}${t.tag ? ` &nbsp;·&nbsp; <span style="color:#c4b5fd;">${escapeHtml(t.tag)}</span>` : ""}
            </div>
          </td>
          <td align="right" style="white-space:nowrap;vertical-align:top;">
            ${isOverdue
              ? `<span style="background:#450a0a;color:#fca5a5;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #7f1d1d;">OVERDUE</span>`
              : `<span style="background:#1e2030;color:#9ca3af;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #2d3147;">OPEN</span>`}
          </td>
        </tr></table>
        <div style="margin-top:8px;font-size:12px;color:#6b7280;">
          Opened ${fmtDateTime(t.created_at)} &nbsp;·&nbsp; ${fmtDuration(ageMs)} ago
        </div>
        <div style="margin-top:10px;text-align:right;">
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
  <div style="max-width:560px;margin:0 auto;padding:24px 16px 48px;">

    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">SeaWorld Entertainment Maintenance</div>
      <h1 style="margin:0;font-size:22px;color:#e5e7eb;font-weight:800;">📋 Your Assigned Tickets</h1>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">Weekly Wednesday Recap · Hi ${escapeHtml(name)}</div>
    </div>

    <div style="background:#161827;border-radius:12px;padding:16px;text-align:center;margin-bottom:22px;border:1px solid #2d3147;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#818cf8;">${tickets.length}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">Open Assigned</div>
        </td>
        <td style="text-align:center;">
          <div style="font-size:28px;font-weight:800;color:${overdueCount > 0 ? "#f87171" : "#6b7280"};">${overdueCount}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">Overdue</div>
        </td>
      </tr></table>
    </div>

    ${rows}

    <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #1e2030;">
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
    // All open tickets that have an individual assignee (not the Show Tech group, not unassigned)
    const { data: tickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select("id, title, location, tag, status, created_at, sla_due_at, assigned_to, assigned_to_show_tech")
      .eq("status", "open")
      .not("assigned_to", "is", null)
      .eq("assigned_to_show_tech", false)
      .order("sla_due_at", { ascending: true });

    if (ticketsErr) {
      console.error("[assigned-recap] Tickets fetch error:", ticketsErr.message);
      return { statusCode: 500, body: ticketsErr.message };
    }

    if (!tickets || tickets.length === 0) {
      console.log("[assigned-recap] No open assigned tickets — nothing to send.");
      return { statusCode: 200, body: "No open assigned tickets." };
    }

    // Group tickets by assignee
    const byAssignee = new Map<string, any[]>();
    for (const t of tickets) {
      const list = byAssignee.get(t.assigned_to) || [];
      list.push(t);
      byAssignee.set(t.assigned_to, list);
    }

    // Fetch assignee details — only active EMS/Admin (excludes Show Tech entirely)
    const assigneeIds = [...byAssignee.keys()];
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, name, email, role, is_active")
      .in("id", assigneeIds);

    if (empErr) {
      console.error("[assigned-recap] Employees fetch error:", empErr.message);
      return { statusCode: 500, body: empErr.message };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.error("[assigned-recap] Missing RESEND env vars");
      return { statusCode: 500, body: "Email not configured." };
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const emp of (employees || [])) {
      // Never email Show Tech, never email inactive accounts, never email if no address
      if (emp.role === "show_tech" || !emp.is_active || !emp.email) {
        skippedCount++;
        continue;
      }

      const myTickets = byAssignee.get(emp.id) || [];
      if (myTickets.length === 0) continue; // safety — shouldn't happen given the grouping

      const html = buildHtml(emp.name, myTickets, now);
      const subject = `📋 ${myTickets.length} Open Ticket${myTickets.length !== 1 ? "s" : ""} Assigned to You · Weekly Recap`;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [emp.email], subject, html }),
        });
        if (res.ok) {
          sentCount++;
        } else {
          const err = await res.text();
          console.error(`[assigned-recap] Resend error for ${emp.email}:`, res.status, err);
        }
      } catch (e: any) {
        console.error(`[assigned-recap] Send failed for ${emp.email}:`, e?.message);
      }
    }

    console.log(`[assigned-recap] Sent ${sentCount} recap emails, skipped ${skippedCount}.`);
    return { statusCode: 200, body: `OK — ${sentCount} sent, ${skippedCount} skipped.` };

  } catch (e: any) {
    console.error("[assigned-recap] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Server error" };
  }
};
