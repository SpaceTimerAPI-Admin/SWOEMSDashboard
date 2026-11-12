/**
 * Public EOD report page — no auth required.
 * GET /api/eod-report?date=YYYY-MM-DD
 * GET /api/eod-report          (defaults to today ET)
 *
 * Returns a standalone HTML page with the full day's recap.
 * Protected only by obscurity of the date param — suitable for internal team use.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { businessDayRange, todayBusinessDay, TZ } from "./_eod-day";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;

function ymd(d: Date): string {
  // Get YYYY-MM-DD in ET
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA gives YYYY-MM-DD
}

function escapeHtml(s: string): string {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function empName(employees: any[], empId: string): string {
  return employees.find((x: any) => x.id === empId)?.name || "Unknown";
}

function fmtTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateTime(iso: string): string {
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

function tagChip(tag: string): string {
  const colors: Record<string, [string, string]> = {
    Lighting: ["#FFF8E6", "#92600A"],
    Sound:    ["#EFF4FF", "#2D4DB0"],
    Video:    ["#F0FBF7", "#0D6644"],
    Rides:    ["#FFF0F0", "#B02B2B"],
    Misc:     ["#F5F5F5", "#555555"],
  };
  const [bg, color] = colors[tag] || colors.Misc;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:${bg};color:${color}">${escapeHtml(tag)}</span>`;
}

function statusBadge(closed: boolean): string {
  return closed
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#F0FBF7;color:#0D6644;border:1px solid #34C48A">Closed</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#FFF8E6;color:#92600A;border:1px solid #F5C842">Open</span>`;
}

function buildPage(opts: {
  day: string;
  tickets: any[];
  projects: any[];
  ticketComments: any[];
  projectComments: any[];
  employees: any[];
  siteBaseUrl: string;
  shiftLogEntries: any[];
  fountainAck: any | null;
}): string {
  const { day, tickets, projects, ticketComments, projectComments, employees, siteBaseUrl, shiftLogEntries, fountainAck } = opts;

  const dateDisplay = new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const totalOpen = [...tickets, ...projects].filter(i => i.status !== "closed" && !i.closed_at).length;
  const totalClosed = [...tickets, ...projects].filter(i => i.status === "closed" || i.closed_at).length;

  const tagSections = TAGS.map(tag => {
    const tagTickets = tickets.filter(t => (t.tag || "Misc") === tag);
    const tagProjects = projects.filter(p => (p.tag || "Misc") === tag);
    if (!tagTickets.length && !tagProjects.length) return "";

    const rows = [...tagTickets.map(t => {
      const closed = t.status === "closed" || !!t.closed_at;
      const res = closed && t.closed_at ? resolutionTime(t.created_at, t.closed_at) : null;
      const comments = ticketComments.filter(c => c.ticket_id === t.id);
      const url = siteBaseUrl ? `${siteBaseUrl}/tickets/${t.id}` : null;
      return `
        <div style="padding:16px;border-bottom:1px solid #F0F0F0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:600;color:#1A1A2E;margin-bottom:4px">
                ${url ? `<a href="${url}" style="color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(t.title)}</a>` : escapeHtml(t.title)}
              </div>
              <div style="font-size:13px;color:#666;margin-bottom:6px">
                📍 ${escapeHtml(t.location)} &nbsp;·&nbsp; Logged ${fmtTime(t.created_at)} by ${escapeHtml(empName(employees, t.created_by))}
                ${res ? `&nbsp;·&nbsp; ✓ Resolved in <strong>${res}</strong>` : ""}
              </div>
              ${t.details ? `<div style="font-size:13px;color:#444;background:#FAFAFA;padding:8px 10px;border-radius:6px;border-left:3px solid #E0E0E0;margin-bottom:8px">${escapeHtml(t.details)}</div>` : ""}
              ${comments.length ? `
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:6px">Updates (${comments.length})</div>
                <div style="border-left:2px solid #E5E5E5;padding-left:10px">
                  ${comments.map(c => `
                    <div style="margin-bottom:8px">
                      <div style="font-size:12px;color:#888">${fmtDateTime(c.created_at)} — ${escapeHtml(empName(employees, c.employee_id))}</div>
                      <div style="font-size:13px;color:#333">${escapeHtml(c.comment)}</div>
                    </div>
                  `).join("")}
                </div>
              ` : ""}
            </div>
            <div>${statusBadge(closed)}</div>
          </div>
        </div>`;
    }), ...tagProjects.map(p => {
      const closed = p.status === "closed" || !!p.closed_at;
      const res = closed && p.closed_at ? resolutionTime(p.created_at, p.closed_at) : null;
      const comments = projectComments.filter(c => c.project_id === p.id);
      const url = siteBaseUrl ? `${siteBaseUrl}/projects/${p.id}` : null;
      return `
        <div style="padding:16px;border-bottom:1px solid #F0F0F0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-bottom:3px">Project</div>
              <div style="font-size:15px;font-weight:600;color:#1A1A2E;margin-bottom:4px">
                ${url ? `<a href="${url}" style="color:#1A1A2E;text-decoration:none;border-bottom:1px solid #CBD5E1">${escapeHtml(p.title)}</a>` : escapeHtml(p.title)}
              </div>
              <div style="font-size:13px;color:#666;margin-bottom:6px">
                📍 ${escapeHtml(p.location)} &nbsp;·&nbsp; Created ${fmtTime(p.created_at)} by ${escapeHtml(empName(employees, p.created_by))}
                ${res ? `&nbsp;·&nbsp; ✓ Resolved in <strong>${res}</strong>` : ""}
              </div>
              ${p.details ? `<div style="font-size:13px;color:#444;background:#FAFAFA;padding:8px 10px;border-radius:6px;border-left:3px solid #E0E0E0;margin-bottom:8px">${escapeHtml(p.details)}</div>` : ""}
              ${comments.length ? `
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:6px">Updates (${comments.length})</div>
                <div style="border-left:2px solid #E5E5E5;padding-left:10px">
                  ${comments.map(c => `
                    <div style="margin-bottom:8px">
                      <div style="font-size:12px;color:#888">${fmtDateTime(c.created_at)} — ${escapeHtml(empName(employees, c.employee_id))}</div>
                      <div style="font-size:13px;color:#333">${escapeHtml(c.comment)}</div>
                    </div>
                  `).join("")}
                </div>
              ` : ""}
            </div>
            <div>${statusBadge(closed)}</div>
          </div>
        </div>`;
    })].join("");

    return `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${tagChip(tag)}
          <span style="font-size:13px;color:#999">${tagTickets.length + tagProjects.length} item${tagTickets.length + tagProjects.length !== 1 ? "s" : ""}</span>
        </div>
        <div style="background:#fff;border:1px solid #E8E8E8;border-radius:12px;overflow:hidden">
          ${rows}
          <div style="height:1px;background:#F0F0F0;margin-top:-1px"></div>
        </div>
      </div>`;
  }).filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EOD Report — ${escapeHtml(dateDisplay)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F2F4F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 24px 16px 48px; }
  .header { background: linear-gradient(135deg,#1A1A2E 0%,#16213E 60%,#0F3460 100%); border-radius: 14px; padding: 28px; margin-bottom: 16px; }
  .date-bar { background: #fff; border: 1px solid #E8E8E8; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .date-bar label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #888; white-space: nowrap; }
  .date-bar input[type=date] { flex: 1; min-width: 130px; border: 1px solid #E0E0E0; border-radius: 8px; padding: 7px 10px; font-size: 14px; font-family: inherit; color: #1A1A2E; background: #FAFAFA; outline: none; cursor: pointer; }
  .date-bar input[type=date]:focus { border-color: #6B86E0; box-shadow: 0 0 0 3px rgba(107,134,224,0.15); }
  .date-bar .date-nav { display: flex; gap: 6px; }
  .date-bar .date-nav button { padding: 7px 12px; border-radius: 8px; border: 1px solid #E0E0E0; background: #fff; color: #444; font-size: 13px; font-weight: 500; cursor: pointer; }
  .date-bar .date-nav button:hover { background: #F5F5F5; }
  .date-bar .go-btn { padding: 7px 16px; border-radius: 8px; border: none; background: #1A1A2E; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .date-bar .go-btn:hover { background: #0F3460; }
  .stats { background: #fff; border: 1px solid #E8E8E8; border-radius: 12px; display: flex; margin-bottom: 24px; overflow: hidden; }
  .stat { flex: 1; padding: 16px; text-align: center; border-right: 1px solid #F0F0F0; }
  .stat:last-child { border-right: none; }
  .stat-num { font-size: 28px; font-weight: 700; line-height: 1.1; }
  .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-top: 3px; }
  .empty { background: #fff; border: 1px solid #E8E8E8; border-radius: 12px; padding: 40px; text-align: center; color: #999; font-size: 15px; }
  .footer { text-align: center; font-size: 12px; color: #AAA; margin-top: 32px; }
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:6px">SeaWorld Entertainment Maintenance</div>
    <div style="font-size:26px;font-weight:700;color:#fff;letter-spacing:-.02em">End of Day Report</div>
    <div style="font-size:14px;color:rgba(255,255,255,.6);margin-top:5px">${escapeHtml(dateDisplay)}</div>
  </div>

  <!-- Date picker -->
  <div class="date-bar">
    <label>View Date</label>
    <div class="date-nav">
      <button onclick="shiftDay(-1)">← Prev</button>
      <button onclick="goToday()">Today</button>
      <button onclick="shiftDay(1)">Next →</button>
    </div>
    <input type="date" id="datePicker" value="${day}" />
    <button class="go-btn" onclick="goDate()">View</button>
  </div>
  <script>
    var picker = document.getElementById('datePicker');
    function goDate() {
      var v = picker.value;
      if (v) window.location.href = window.location.pathname + '?date=' + v;
    }
    function goToday() {
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,'0');
      var day = String(d.getDate()).padStart(2,'0');
      window.location.href = window.location.pathname + '?date=' + y + '-' + m + '-' + day;
    }
    function shiftDay(delta) {
      var cur = picker.value || new Date().toISOString().slice(0,10);
      var d = new Date(cur + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,'0');
      var day = String(d.getDate()).padStart(2,'0');
      window.location.href = window.location.pathname + '?date=' + y + '-' + m + '-' + day;
    }
    picker.addEventListener('keydown', function(e) { if (e.key === 'Enter') goDate(); });
  </script>

  <div class="stats">
    <div class="stat">
      <div class="stat-num" style="color:#1A1A2E">${tickets.length + projects.length}</div>
      <div class="stat-label">Total Items</div>
    </div>
    <div class="stat">
      <div class="stat-num" style="color:#D97706">${totalOpen}</div>
      <div class="stat-label">Still Open</div>
    </div>
    <div class="stat">
      <div class="stat-num" style="color:#059669">${totalClosed}</div>
      <div class="stat-label">Closed</div>
    </div>
  </div>

  ${tagSections || '<div class="empty">🌙 No tickets or projects logged today.</div>'}

  ${shiftLogEntries.length > 0 ? `
  <div style="margin-top:32px;margin-bottom:8px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:12px">
      📓 Shift Log (${shiftLogEntries.length} entr${shiftLogEntries.length !== 1 ? "ies" : "y"})
    </div>
    <div style="background:#fff;border:1px solid #E8E8E8;border-radius:12px;overflow:hidden">
      ${shiftLogEntries.map((e: any) => `
        <div style="padding:12px 16px;border-bottom:1px solid #F5F5F5">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600;color:#6B5ED6">${escapeHtml(e.employee_name || "Unknown")}</span>
            <span style="font-size:11px;color:#AAA">${fmtTime(e.created_at)}</span>
          </div>
          <div style="font-size:14px;color:#333;line-height:1.5">${escapeHtml(e.note)}</div>
        </div>
      `).join("")}
    </div>
  </div>
  ` : ""}

  <!-- Fountain acknowledgment -->
  <div style="margin-top:32px;margin-bottom:8px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:12px">
      💧 Lake Fountain Check-off
    </div>
    ${fountainAck ? (() => {
      const bayOk  = fountainAck.bay_side_status  !== "issue";
      const lakeOk = fountainAck.lakeside_status  !== "issue";
      const allOk  = bayOk && lakeOk;
      const headerColor = allOk ? "#059669" : "#DC2626";
      const headerEmoji = allOk ? "✅" : (bayOk || lakeOk ? "⚠️" : "🚨");
      const headerText  = allOk
        ? "All fountains ON &amp; functioning"
        : "Acknowledged — one or more fountains have an issue";

      const fountainRow = (label: string, ok: boolean, note?: string | null) => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid #F0F0F0">
          <span style="font-size:16px;line-height:1.4">${ok ? "✅" : "⚠️"}</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:${ok ? "#059669" : "#DC2626"}">${escapeHtml(label)}: ${ok ? "On &amp; Functioning" : "Issue Reported"}</div>
            ${!ok && note ? `<div style="font-size:12px;color:#666;margin-top:2px">${escapeHtml(note)}</div>` : ""}
          </div>
        </div>`;

      return `
    <div style="background:#fff;border:1px solid ${allOk ? "#E8E8E8" : "#FECACA"};border-radius:12px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:28px">${headerEmoji}</span>
        <div style="font-size:14px;font-weight:700;color:${headerColor}">${headerText}</div>
      </div>
      ${fountainRow("Bay Side Fountains",  bayOk,  fountainAck.bay_side_note)}
      ${fountainRow("Lakeside Fountains",  lakeOk, fountainAck.lakeside_note)}
      <div style="font-size:12px;color:#999;margin-top:12px;padding-top:10px;border-top:1px solid #F0F0F0">
        Signed by <strong>${escapeHtml(fountainAck.employee_name)}</strong>
        (${escapeHtml(fountainAck.employee_id_text)})
        at ${fmtDateTime(fountainAck.acked_at)}
        ${fountainAck.lat != null && fountainAck.lon != null
          ? `· <a href="https://maps.google.com/?q=${fountainAck.lat},${fountainAck.lon}" target="_blank" style="color:#059669">📍 View location</a>`
          : "· <span style=\"color:#bbb\">No GPS</span>"
        }
      </div>
    </div>`;
    })() : `
    <div style="background:#fff;border:1px solid #FECACA;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px">
      <span style="font-size:28px">⚠️</span>
      <div>
        <div style="font-size:14px;font-weight:700;color:#DC2626">Not acknowledged today</div>
        <div style="font-size:13px;color:#666;margin-top:4px">No one signed off on the lake fountains for this business day.</div>
      </div>
    </div>
    `}
  </div>

  <div class="footer">SeaWorld Entertainment Maintenance · EOD Report · ${escapeHtml(dateDisplay)}</div>
</div>
</body>
</html>`;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const supabase = supabaseAdmin();
    const qs = event.queryStringParameters || {};

    // Determine the business day to show (4 AM ET cutoff)
    const rawDate = (qs.date || "").trim();
    const day = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayBusinessDay();

    const { start, end } = businessDayRange(day);

    const [ticketsRes, ticketsClosedRes, ticketCommentsRes, projectsRes, projectsClosedRes, projectCommentsRes, employeesRes, shiftLogRes, fountainAckRes] = await Promise.all([
      supabase.from("tickets").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("*").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("ticket_comments").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("*").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("project_comments").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("employees").select("id, name"),
      supabase.from("shift_log_entries")
        .select("id, note, created_at, employee_id, employees!shift_log_entries_employee_id_fkey(name)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: true }),
      supabase.from("fountain_acknowledgments")
        .select("id, employee_id_text, employee_name, acked_at, lat, lon, bay_side_status, bay_side_note, lakeside_status, lakeside_note")
        .gte("acked_at", start).lte("acked_at", end)
        .order("acked_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Deduplicate tickets (created + closed + commented-on today)
    const ticketMap = new Map<string, any>();
    for (const t of [...(ticketsRes.data || []), ...(ticketsClosedRes.data || [])]) ticketMap.set(t.id, t);
    const commentedTicketIds = [...new Set((ticketCommentsRes.data || []).map((c: any) => c.ticket_id))].filter(id => !ticketMap.has(id));
    if (commentedTicketIds.length) {
      const { data: extra } = await supabase.from("tickets").select("*").in("id", commentedTicketIds);
      for (const t of (extra || [])) ticketMap.set(t.id, t);
    }

    const projectMap = new Map<string, any>();
    for (const p of [...(projectsRes.data || []), ...(projectsClosedRes.data || [])]) projectMap.set(p.id, p);
    const commentedProjectIds = [...new Set((projectCommentsRes.data || []).map((c: any) => c.project_id))].filter(id => !projectMap.has(id));
    if (commentedProjectIds.length) {
      const { data: extra } = await supabase.from("projects").select("*").in("id", commentedProjectIds);
      for (const p of (extra || [])) projectMap.set(p.id, p);
    }

    const shiftLogEntries = (shiftLogRes.data || []).map((e: any) => ({
      ...e,
      employee_name: e.employees?.name || "Unknown",
    }));

    const html = buildPage({
      day,
      tickets: Array.from(ticketMap.values()),
      projects: Array.from(projectMap.values()),
      ticketComments: ticketCommentsRes.data || [],
      projectComments: projectCommentsRes.data || [],
      employees: employeesRes.data || [],
      siteBaseUrl: (process.env.SITE_BASE_URL || "").replace(/\/$/, ""),
      shiftLogEntries,
      fountainAck: fountainAckRes.data || null,
    });

    return {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      body: html,
    };
  } catch (e: any) {
    return { statusCode: 500, body: `<pre>Error: ${e?.message}</pre>` };
  }
};
