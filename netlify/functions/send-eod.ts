import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;
const TZ = "America/New_York";

function ymd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in ET
}

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function empName(employees: any[], empId: string) {
  return employees.find((x: any) => x.id === empId)?.name || "Unknown";
}

function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function resolutionTime(createdAt: string, closedAt: string): string {
  const diffMs = new Date(closedAt).getTime() - new Date(createdAt).getTime();
  if (diffMs <= 0) return "";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function tagColor(tag: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    Lighting: { bg: "#FFF8E6", text: "#92600A", border: "#F5C842" },
    Sound:    { bg: "#EFF4FF", text: "#2D4DB0", border: "#6B86E0" },
    Video:    { bg: "#F0FBF7", text: "#0D6644", border: "#34C48A" },
    Rides:    { bg: "#FFF0F0", text: "#B02B2B", border: "#E06B6B" },
    Misc:     { bg: "#F5F5F5", text: "#555555", border: "#BBBBBB" },
  };
  return map[tag] || map.Misc;
}

function statusBadge(closed: boolean) {
  return closed
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#F0FBF7;color:#0D6644;border:1px solid #34C48A">Closed</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#FFF8E6;color:#92600A;border:1px solid #F5C842">Open</span>`;
}

function buildEmailHtml(opts: {
  day: string;
  generatedBy: string;
  generatedAt: string;
  notes: string;
  handoffNotes: string;
  tickets: any[];
  ticketComments: any[];
  projects: any[];
  projectComments: any[];
  employees: any[];
  siteBaseUrl: string;
  olderOpenTickets: any[];
  olderOpenProjects: any[];
}): string {
  const { day, generatedBy, generatedAt, notes, handoffNotes, tickets, ticketComments,
          projects, projectComments, employees, siteBaseUrl,
          olderOpenTickets, olderOpenProjects } = opts;

  const dateDisplay = new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  // Today's stats
  const todayClosed = [...tickets, ...projects].filter(i => i.status === "closed" || i.closed_at).length;
  const systemOpenCount =
    [...tickets, ...projects].filter(i => i.status !== "closed" && !i.closed_at).length +
    olderOpenTickets.length + olderOpenProjects.length;

  // Per-tag sections (today's activity only)
  const tagSections = TAGS.map(tag => {
    const tagTickets = tickets.filter(t => (t.tag || "Misc") === tag);
    const tagProjects = projects.filter(p => (p.tag || "Misc") === tag);
    if (!tagTickets.length && !tagProjects.length) return "";

    const colors = tagColor(tag);

    const ticketRows = tagTickets.map(t => {
      const who = empName(employees, t.created_by);
      const comments = ticketComments.filter(c => c.ticket_id === t.id);
      const closed = t.status === "closed" || !!t.closed_at;
      const res = closed && t.closed_at ? resolutionTime(t.created_at, t.closed_at) : null;
      const url = siteBaseUrl ? `${siteBaseUrl}/tickets/${t.id}` : null;
      const titleHtml = url
        ? `<a href="${url}" style="font-weight:600;font-size:14px;color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(t.title)}</a>`
        : `<span style="font-weight:600;font-size:14px;color:#1A1A2E">${escapeHtml(t.title)}</span>`;
      return `<tr><td style="padding:14px 16px;border-bottom:1px solid #F0F0F0;vertical-align:top">
        <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="margin-bottom:4px">${titleHtml}</div>
            <div style="font-size:12px;color:#666;margin-bottom:6px">
              📍 ${escapeHtml(t.location)} &nbsp;·&nbsp; Logged by ${escapeHtml(who)} at ${fmtTime(t.created_at)}
              ${res ? `&nbsp;·&nbsp; ✓ Resolved in <strong>${res}</strong>` : ""}
            </div>
            ${t.details ? `<div style="font-size:13px;color:#444;background:#FAFAFA;padding:8px 10px;border-radius:6px;border-left:3px solid ${colors.border};margin-bottom:8px">${escapeHtml(t.details)}</div>` : ""}
            ${comments.length ? `
              <div style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Updates (${comments.length})</div>
              <div style="border-left:2px solid #E5E5E5;padding-left:10px">
                ${comments.map(c => `<div style="margin-bottom:6px">
                  <span style="font-size:12px;color:#777">${fmtDateTime(c.created_at)} — ${escapeHtml(empName(employees, c.employee_id))}</span><br/>
                  <span style="font-size:13px;color:#333">${escapeHtml(c.comment)}</span>
                </div>`).join("")}
              </div>` : ""}
          </div>
          <div>${statusBadge(closed)}</div>
        </div>
      </td></tr>`;
    }).join("");

    const projectRows = tagProjects.map(p => {
      const who = empName(employees, p.created_by);
      const comments = projectComments.filter(c => c.project_id === p.id);
      const closed = p.status === "closed" || !!p.closed_at;
      const res = closed && p.closed_at ? resolutionTime(p.created_at, p.closed_at) : null;
      const url = siteBaseUrl ? `${siteBaseUrl}/projects/${p.id}` : null;
      const titleHtml = url
        ? `<a href="${url}" style="font-weight:600;font-size:14px;color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(p.title)}</a>`
        : `<span style="font-weight:600;font-size:14px;color:#1A1A2E">${escapeHtml(p.title)}</span>`;
      return `<tr><td style="padding:14px 16px;border-bottom:1px solid #F0F0F0;vertical-align:top">
        <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.05em">Project</span>
              ${titleHtml}
            </div>
            <div style="font-size:12px;color:#666;margin-bottom:6px">
              📍 ${escapeHtml(p.location)} &nbsp;·&nbsp; Created by ${escapeHtml(who)} at ${fmtTime(p.created_at)}
              ${res ? `&nbsp;·&nbsp; ✓ Resolved in <strong>${res}</strong>` : ""}
            </div>
            ${p.details ? `<div style="font-size:13px;color:#444;background:#FAFAFA;padding:8px 10px;border-radius:6px;border-left:3px solid ${colors.border};margin-bottom:8px">${escapeHtml(p.details)}</div>` : ""}
            ${comments.length ? `
              <div style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Updates (${comments.length})</div>
              <div style="border-left:2px solid #E5E5E5;padding-left:10px">
                ${comments.map(c => `<div style="margin-bottom:6px">
                  <span style="font-size:12px;color:#777">${fmtDateTime(c.created_at)} — ${escapeHtml(empName(employees, c.employee_id))}</span><br/>
                  <span style="font-size:13px;color:#333">${escapeHtml(c.comment)}</span>
                </div>`).join("")}
              </div>` : ""}
          </div>
          <div>${statusBadge(closed)}</div>
        </div>
      </td></tr>`;
    }).join("");

    return `<div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border}">${tag}</span>
        <span style="font-size:12px;color:#888">${tagTickets.length + tagProjects.length} item${tagTickets.length + tagProjects.length !== 1 ? "s" : ""}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E8E8E8;border-radius:10px;overflow:hidden">
        ${ticketRows}${projectRows}
      </table>
    </div>`;
  }).filter(Boolean).join("");

  // Older open items section (compact — no details)
  const olderRows = [
    ...olderOpenTickets.map(t => {
      const age = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
      const url = siteBaseUrl ? `${siteBaseUrl}/tickets/${t.id}` : null;
      const colors = tagColor(t.tag || "Misc");
      return `<tr><td style="padding:10px 16px;border-bottom:1px solid #F5F5F5">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1A1A2E">
              ${url ? `<a href="${url}" style="color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(t.title)}</a>` : escapeHtml(t.title)}
            </div>
            <div style="font-size:12px;color:#888;margin-top:2px">
              📍 ${escapeHtml(t.location)} &nbsp;·&nbsp; ${age === 1 ? "1 day ago" : `${age} days ago`}
              &nbsp;·&nbsp; <span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:700;background:${colors.bg};color:${colors.text}">${t.tag || "Misc"}</span>
            </div>
          </div>
          <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#FFF8E6;color:#92600A;border:1px solid #F5C842;white-space:nowrap">Open</span>
        </div>
      </td></tr>`;
    }),
    ...olderOpenProjects.map(p => {
      const age = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
      const url = siteBaseUrl ? `${siteBaseUrl}/projects/${p.id}` : null;
      const colors = tagColor(p.tag || "Misc");
      return `<tr><td style="padding:10px 16px;border-bottom:1px solid #F5F5F5">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;color:#AAA;text-transform:uppercase;font-weight:600;letter-spacing:.04em;margin-bottom:1px">Project</div>
            <div style="font-size:13px;font-weight:600;color:#1A1A2E">
              ${url ? `<a href="${url}" style="color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(p.title)}</a>` : escapeHtml(p.title)}
            </div>
            <div style="font-size:12px;color:#888;margin-top:2px">
              📍 ${escapeHtml(p.location)} &nbsp;·&nbsp; ${age === 1 ? "1 day ago" : `${age} days ago`}
              &nbsp;·&nbsp; <span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:700;background:${colors.bg};color:${colors.text}">${p.tag || "Misc"}</span>
            </div>
          </div>
          <span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#FFF8E6;color:#92600A;border:1px solid #F5C842;white-space:nowrap">Open</span>
        </div>
      </td></tr>`;
    }),
  ].join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:24px 0">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1A1A2E 0%,#16213E 60%,#0F3460 100%);border-radius:14px 14px 0 0;padding:28px 28px 24px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:6px">SeaWorld Entertainment Maintenance</div>
              <div style="font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:-.02em">End of Day Report</div>
              <div style="font-size:14px;color:rgba(255,255,255,.65);margin-top:4px">${dateDisplay}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:2px">Generated by</div>
              <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.85)">${escapeHtml(generatedBy)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">${escapeHtml(generatedAt)}</div>
            </div>
          </div>
        </td></tr>

        <!-- Summary bar -->
        <tr><td style="background:#FFFFFF;border-left:1px solid #E8E8E8;border-right:1px solid #E8E8E8;padding:0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 28px;border-right:1px solid #F0F0F0;text-align:center">
                <div style="font-size:26px;font-weight:700;color:#1A1A2E">${tickets.length + projects.length}</div>
                <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Today's Items</div>
              </td>
              <td style="padding:16px 28px;border-right:1px solid #F0F0F0;text-align:center">
                <div style="font-size:26px;font-weight:700;color:#D97706">${systemOpenCount}</div>
                <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Open System-Wide</div>
              </td>
              <td style="padding:16px 28px;text-align:center">
                <div style="font-size:26px;font-weight:700;color:#059669">${todayClosed}</div>
                <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Closed Today</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#FFFFFF;border:1px solid #E8E8E8;border-top:0;border-radius:0 0 14px 14px;padding:24px 28px">

          ${notes.trim() ? `
          <div style="margin-bottom:24px">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px">Operator Notes</div>
            <div style="background:#F8F9FF;border:1px solid #E4E7FF;border-radius:8px;padding:14px 16px;font-size:14px;color:#333;line-height:1.6">${escapeHtml(notes).replace(/\n/g, "<br>")}</div>
          </div>` : ""}

          ${handoffNotes.trim() ? `
          <div style="margin-bottom:24px">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px">Handoff Notes</div>
            <div style="background:#FFFBF0;border:1px solid #F5E4A8;border-radius:8px;padding:14px 16px;font-size:14px;color:#333;line-height:1.6">${escapeHtml(handoffNotes).replace(/\n/g, "<br>")}</div>
          </div>` : ""}

          ${(notes.trim() || handoffNotes.trim()) ? `<hr style="border:none;border-top:1px solid #F0F0F0;margin:0 0 24px">` : ""}

          <!-- Today's activity by tag -->
          ${tagSections || `<div style="text-align:center;padding:32px;color:#888;font-size:14px">No tickets or projects logged today.</div>`}

          <!-- Older open items -->
          ${olderRows ? `
          <div style="margin-top:28px;padding-top:24px;border-top:2px solid #F0F0F0">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:12px">
              ⏳ Still Open From Previous Days (${olderOpenTickets.length + olderOpenProjects.length})
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E8E8E8;border-radius:10px;overflow:hidden">
              ${olderRows}
            </table>
          </div>` : ""}

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 0;text-align:center">
          <div style="font-size:11px;color:#AAA">SeaWorld Entertainment Maintenance · Auto-generated EOD Report</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const notes = String(body.notes || "");
    const handoff_notes = String(body.handoff_notes || "");

    // Always report on today in ET
    const day = ymd(new Date());
    const start = new Date(day + "T00:00:00").toISOString();
    const end   = new Date(day + "T23:59:59.999").toISOString();

    const supabase = supabaseAdmin();

    const [ticketsCreated, ticketsClosed, ticketsCommented,
           projectsCreated, projectsClosed, projectsCommented,
           employees, olderOpenTicketsRes, olderOpenProjectsRes] = await Promise.all([
      supabase.from("tickets").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("*").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("ticket_comments").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("*").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("project_comments").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("employees").select("id, name, employee_id, email"),
      // All open tickets/projects created BEFORE today
      supabase.from("tickets").select("id, title, location, tag, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
      supabase.from("projects").select("id, title, location, tag, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
    ]);

    // Deduplicate today's tickets
    const ticketMap = new Map<string, any>();
    for (const t of [...(ticketsCreated.data || []), ...(ticketsClosed.data || [])]) ticketMap.set(t.id, t);
    const commentedTicketIds = [...new Set((ticketsCommented.data || []).map((c: any) => c.ticket_id))].filter(id => !ticketMap.has(id));
    if (commentedTicketIds.length) {
      const { data: extra } = await supabase.from("tickets").select("*").in("id", commentedTicketIds);
      for (const t of (extra || [])) ticketMap.set(t.id, t);
    }
    const allTickets = Array.from(ticketMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Deduplicate today's projects
    const projectMap = new Map<string, any>();
    for (const p of [...(projectsCreated.data || []), ...(projectsClosed.data || [])]) projectMap.set(p.id, p);
    const commentedProjectIds = [...new Set((projectsCommented.data || []).map((c: any) => c.project_id))].filter(id => !projectMap.has(id));
    if (commentedProjectIds.length) {
      const { data: extra } = await supabase.from("projects").select("*").in("id", commentedProjectIds);
      for (const p of (extra || [])) projectMap.set(p.id, p);
    }
    const allProjects = Array.from(projectMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const allEmployees = employees.data || [];
    const generatedAt = new Date().toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    const siteBaseUrl = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");

    const html = buildEmailHtml({
      day,
      generatedBy: session.employee.name,
      generatedAt,
      notes,
      handoffNotes: handoff_notes,
      tickets: allTickets,
      ticketComments: ticketsCommented.data || [],
      projects: allProjects,
      projectComments: projectsCommented.data || [],
      employees: allEmployees,
      siteBaseUrl,
      olderOpenTickets: olderOpenTicketsRes.data || [],
      olderOpenProjects: olderOpenProjectsRes.data || [],
    });

    const subject = `EOD Report — ${day} — SeaWorld Maintenance`;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return badRequest("Email not configured (RESEND_API_KEY/RESEND_FROM_EMAIL)");

    const to = session.employee.email;
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html }),
    });

    let email_status = "sent";
    let email_error: string | null = null;
    if (!sendRes.ok) {
      email_status = "failed";
      const errBody = await sendRes.text().catch(() => "");
      email_error = `Resend ${sendRes.status}: ${errBody}`;
      console.error("[send-eod] Resend error", { status: sendRes.status, body: errBody, to });
    }

    await supabase.from("end_of_day_reports").insert({
      report_date: day,
      created_by: session.employee.id,
      notes,
      handoff_notes,
      snapshot_json: { tickets: allTickets, projects: allProjects },
      emailed_to: to,
      email_status,
      email_error,
    });

    if (email_status === "failed") return json({ ok: false, error: "Email send failed", detail: email_error }, 502);

    return json({ ok: true, emailed_to: to, ticket_count: allTickets.length, project_count: allProjects.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
