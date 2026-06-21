/**
 * Scheduled: Every Monday and Thursday at 8 AM ET (12:00 UTC)
 * Sends each active EMS + Admin employee an email with:
 *   1. A shared section listing ALL overdue tickets system-wide (same for everyone)
 *   2. A personal section listing tickets currently assigned to THEM (open, not overdue-only)
 * Show Tech is never emailed, and tickets assigned to the Show Tech group never
 * appear in anyone's personal section.
 * Skips sending entirely if there are zero overdue tickets system-wide.
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

function overdueTicketCard(t: any, now: Date): string {
  const overdueMs = now.getTime() - new Date(t.sla_due_at).getTime();
  const openedMs  = now.getTime() - new Date(t.created_at).getTime();
  const assignee  = t.assigned_to_show_tech ? "Show Tech" : t.assignee_name || "Unassigned";
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
}

function assignedTicketCard(t: any, now: Date): string {
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
}

function buildHtml(opts: {
  name: string;
  overdueTickets: any[];
  myTickets: any[];
  now: Date;
  dateDisplay: string;
}): string {
  const { name, overdueTickets, myTickets, now, dateDisplay } = opts;
  const overdueCount = overdueTickets.length;
  const myOverdueCount = myTickets.filter((t: any) => new Date(t.sla_due_at) < now).length;

  const overdueSection = overdueTickets.map(t => overdueTicketCard(t, now)).join("");

  const mySection = myTickets.length === 0 ? "" : `
    <div style="margin-top:32px;margin-bottom:16px;">
      <h2 style="font-size:17px;color:#e5e7eb;font-weight:800;margin:0 0 4px;">📋 Your Assigned Tickets</h2>
      <div style="font-size:13px;color:#6b7280;">${myTickets.length} open ticket${myTickets.length !== 1 ? "s" : ""} currently assigned to you${myOverdueCount > 0 ? `, ${myOverdueCount} overdue` : ""}</div>
    </div>
    ${myTickets.map(t => assignedTicketCard(t, now)).join("")}
  `;

  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px 48px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">SeaWorld Entertainment Maintenance · Hi ${escapeHtml(name)}</div>
      <h1 style="margin:0;font-size:24px;color:#f87171;font-weight:800;">⚠️ Overdue Ticket Alert</h1>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">${dateDisplay}</div>
    </div>

    <!-- Summary bar -->
    <div style="background:#1c1e2e;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;border:1px solid #2d3147;">
      <div style="font-size:32px;font-weight:800;color:#f87171;">${overdueCount}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:2px;">
        ticket${overdueCount !== 1 ? "s" : ""} past SLA deadline system-wide
      </div>
    </div>

    <!-- All overdue tickets (shared section) -->
    ${overdueSection}

    <!-- Personal assigned section -->
    ${mySection}

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
    // 1. Fetch all open overdue tickets with their comments (shared across all recipients)
    const { data: overdueTickets, error: overdueErr } = await supabase
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

    if (overdueErr) {
      console.error("[overdue-alert] Overdue tickets fetch error:", overdueErr.message);
      return { statusCode: 500, body: overdueErr.message };
    }

    if (!overdueTickets || overdueTickets.length === 0) {
      console.log("[overdue-alert] No overdue tickets — skipping email entirely.");
      return { statusCode: 200, body: "No overdue tickets." };
    }

    const shapedOverdue = overdueTickets.map((t: any) => ({
      ...t,
      assignee_name: t.assignee?.name || null,
      comments: (t.comments || [])
        .map((c: any) => ({ ...c, employee_name: c.employees?.name || "Unknown", note: c.comment }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));

    // 2. Fetch ALL open tickets with an individual assignee (for personal sections)
    //    Excludes Show Tech group assignments — those never appear in anyone's personal section.
    const { data: assignedTickets, error: assignedErr } = await supabase
      .from("tickets")
      .select("id, title, location, tag, status, created_at, sla_due_at, assigned_to, assigned_to_show_tech")
      .eq("status", "open")
      .not("assigned_to", "is", null)
      .eq("assigned_to_show_tech", false)
      .order("sla_due_at", { ascending: true });

    if (assignedErr) {
      console.error("[overdue-alert] Assigned tickets fetch error:", assignedErr.message);
      return { statusCode: 500, body: assignedErr.message };
    }

    const byAssignee = new Map<string, any[]>();
    for (const t of (assignedTickets || [])) {
      const list = byAssignee.get(t.assigned_to) || [];
      list.push(t);
      byAssignee.set(t.assigned_to, list);
    }

    // 3. Fetch all active EMS + Admin employees with email set — Show Tech never included
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

    if (!employees || employees.length === 0) {
      console.log("[overdue-alert] No recipients found.");
      return { statusCode: 200, body: "No recipients." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.error("[overdue-alert] Missing RESEND_API_KEY or RESEND_FROM_EMAIL");
      return { statusCode: 500, body: "Email not configured." };
    }

    const dateDisplay = now.toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    let sentCount = 0;

    // Each recipient gets a personalized email: shared overdue list + their own assigned section
    for (const emp of employees) {
      const myTickets = byAssignee.get(emp.id) || [];

      const html = buildHtml({
        name: emp.name,
        overdueTickets: shapedOverdue,
        myTickets,
        now,
        dateDisplay,
      });

      const subject = myTickets.length > 0
        ? `⚠️ SWOEMS — ${shapedOverdue.length} Overdue (${myTickets.length} assigned to you) · ${now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}`
        : `⚠️ SWOEMS — ${shapedOverdue.length} Overdue Ticket${shapedOverdue.length !== 1 ? "s" : ""} · ${now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}`;

      try {
        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [emp.email], subject, html }),
        });

        if (sendRes.ok) {
          sentCount++;
        } else {
          const errBody = await sendRes.text();
          console.error(`[overdue-alert] Resend error for ${emp.email}:`, sendRes.status, errBody);
        }
      } catch (e: any) {
        console.error(`[overdue-alert] Send failed for ${emp.email}:`, e?.message);
      }
    }

    console.log(`[overdue-alert] Sent ${sentCount}/${employees.length} emails — ${shapedOverdue.length} overdue tickets system-wide.`);
    return { statusCode: 200, body: `OK — ${sentCount} sent, ${shapedOverdue.length} overdue tickets.` };

  } catch (e: any) {
    console.error("[overdue-alert] Uncaught error:", e?.message);
    return { statusCode: 500, body: e?.message || "Server error" };
  }
};
