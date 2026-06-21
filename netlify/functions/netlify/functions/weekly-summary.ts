/**
 * Scheduled: Every Monday at 7 AM ET (11:00 UTC)
 * Sends a weekly digest to all active Admin employees.
 * Covers the previous 7 days (Mon–Sun).
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
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function bar(value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
    <div style="background:#1e2030;border-radius:99px;height:8px;overflow:hidden;margin-top:4px;">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width 0.3s;"></div>
    </div>`;
}

export const handler: Handler = async () => {
  const supabase = supabaseAdmin();
  const now = new Date();

  // Week range: last 7 days
  const weekEnd = now.toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const weekStartLabel = fmtDate(weekStart);
  const weekEndLabel = fmtDate(weekEnd);

  try {
    // ── 1. Tickets opened this week ──────────────────────────────────────────
    const { data: openedTickets, error: openedErr } = await supabase
      .from("tickets")
      .select("id, title, location, tag, status, created_at, closed_at, sla_due_at, sla_minutes, assigned_to_show_tech, assignee:employees!tickets_assigned_to_fkey(name)")
      .gte("created_at", weekStart)
      .lte("created_at", weekEnd)
      .order("created_at", { ascending: false });

    if (openedErr) throw new Error(openedErr.message);

    // ── 2. Tickets closed this week (may have been opened before) ────────────
    const { data: closedTickets, error: closedErr } = await supabase
      .from("tickets")
      .select("id, title, location, tag, created_at, closed_at, sla_minutes")
      .eq("status", "closed")
      .gte("closed_at", weekStart)
      .lte("closed_at", weekEnd)
      .order("closed_at", { ascending: false });

    if (closedErr) throw new Error(closedErr.message);

    // ── 3. Still open tickets (not closed at all) ────────────────────────────
    const { data: stillOpen, error: stillOpenErr } = await supabase
      .from("tickets")
      .select("id, title, location, tag, created_at, sla_due_at")
      .eq("status", "open")
      .order("sla_due_at", { ascending: true });

    if (stillOpenErr) throw new Error(stillOpenErr.message);

    // ── 4. Projects opened this week ─────────────────────────────────────────
    const { data: openedProjects, error: projErr } = await supabase
      .from("projects")
      .select("id, title, location, tag, status, created_at, closed_at")
      .gte("created_at", weekStart)
      .lte("created_at", weekEnd)
      .order("created_at", { ascending: false });

    if (projErr) throw new Error(projErr.message);

    // ── Compute stats ────────────────────────────────────────────────────────
    const opened  = openedTickets || [];
    const closed  = closedTickets || [];
    const open    = stillOpen || [];
    const projects = openedProjects || [];

    // Average resolution time (only tickets closed this week that have both dates)
    const resolutionTimes = closed
      .filter((t: any) => t.created_at && t.closed_at)
      .map((t: any) => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
    const avgResolutionMs = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : null;

    // SLA compliance: how many closed tickets were closed before sla_due_at
    const closedWithSla = closed.filter((t: any) => t.closed_at && t.sla_due_at);
    const onTime = closedWithSla.filter((t: any) => new Date(t.closed_at) <= new Date(t.sla_due_at)).length;
    const slaRate = closedWithSla.length > 0 ? Math.round((onTime / closedWithSla.length) * 100) : null;

    // Overdue right now
    const overdueNow = open.filter((t: any) => new Date(t.sla_due_at) < now);

    // ── Normalize locations using Claude ─────────────────────────────────────
    const rawLocations = opened.map((t: any) => t.location).filter(Boolean);
    let locationMap: Record<string, string> = {};

    if (rawLocations.length > 0) {
      try {
        const uniqueRaw = [...new Set(rawLocations)] as string[];
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: `You are normalizing location names from a SeaWorld maintenance system. 
Group these location names that refer to the same physical place and pick the best canonical name for each group.
Common abbreviations: JTA = Journey to Atlantis, EO = Expedition Odyssey, IB = Ice Breaker, etc.

Input locations: ${JSON.stringify(uniqueRaw)}

Return ONLY a JSON object mapping each input location to its canonical name. Example:
{"JTA": "Journey to Atlantis", "jta": "Journey to Atlantis", "Journey To Atlantis": "Journey to Atlantis"}

Return nothing else — no explanation, no markdown, just the JSON object.`,
            }],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text = claudeData.content?.[0]?.text || "{}";
          const clean = text.replace(/```json|```/g, "").trim();
          locationMap = JSON.parse(clean);
        }
      } catch (e) {
        console.warn("[weekly-summary] Claude normalization failed, using raw locations:", e);
      }
    }

    // Apply normalization when counting
    const locationCount: Record<string, number> = {};
    for (const t of opened) {
      const raw = (t as any).location || "Unknown";
      const loc = locationMap[raw] || raw;
      locationCount[loc] = (locationCount[loc] || 0) + 1;
    }
    const topLocations = Object.entries(locationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Tag breakdown
    const tagCount: Record<string, number> = {};
    for (const t of opened) {
      const tag = (t as any).tag || "Untagged";
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
    const tagBreakdown = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
    const maxTag = tagBreakdown[0]?.[1] || 1;

    const TAG_COLORS: Record<string, string> = {
      Lighting: "#818cf8", Sound: "#34d399", Video: "#f59e0b",
      Rides: "#f87171", Misc: "#9ca3af", Untagged: "#6b7280",
    };

    // ── Admin recipients ─────────────────────────────────────────────────────
    const { data: admins, error: adminsErr } = await supabase
      .from("employees")
      .select("email")
      .eq("is_active", true)
      .eq("role", "admin")
      .neq("email", "");

    if (adminsErr) throw new Error(adminsErr.message);
    const recipients = (admins || []).map((e: any) => e.email).filter(Boolean);
    if (recipients.length === 0) {
      console.log("[weekly-summary] No admin recipients.");
      return { statusCode: 200, body: "No recipients." };
    }

    // ── Build HTML ───────────────────────────────────────────────────────────
    const statBox = (value: string | number, label: string, color: string) => `
      <td style="text-align:center;padding:12px 8px;">
        <div style="font-size:28px;font-weight:800;color:${color};">${value}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      </td>`;

    const ticketRow = (t: any, showStatus = false) => `
      <tr style="border-bottom:1px solid #1e2030;">
        <td style="padding:10px 0;">
          <a href="${SITE_URL}/tickets/${escapeHtml(t.id)}" style="font-size:13px;font-weight:600;color:#c7d2fe;text-decoration:none;">
            ${escapeHtml(t.title)}
          </a>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            📍 ${escapeHtml(t.location || "—")}
            ${t.tag ? `&nbsp;·&nbsp;<span style="color:#9ca3af;">${escapeHtml(t.tag)}</span>` : ""}
            ${showStatus && t.status === "open" && new Date(t.sla_due_at) < now
              ? `&nbsp;·&nbsp;<span style="color:#f87171;font-weight:700;">OVERDUE</span>` : ""}
          </div>
        </td>
        <td style="text-align:right;padding:10px 0;white-space:nowrap;font-size:11px;color:#6b7280;">
          ${t.closed_at ? fmtDateTime(t.closed_at) : fmtDateTime(t.created_at)}
        </td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px 48px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">SeaWorld Entertainment Maintenance</div>
    <h1 style="margin:0;font-size:26px;color:#e5e7eb;font-weight:800;">📊 Weekly Summary</h1>
    <div style="font-size:13px;color:#6b7280;margin-top:6px;">${weekStartLabel} – ${weekEndLabel}</div>
  </div>

  <!-- Stats row -->
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;overflow:hidden;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${statBox(opened.length, "Opened", "#818cf8")}
        ${statBox(closed.length, "Closed", "#34d399")}
        ${statBox(overdueNow.length, "Overdue Now", overdueNow.length > 0 ? "#f87171" : "#6b7280")}
        ${statBox(open.length, "Still Open", "#fbbf24")}
      </tr>
    </table>
  </div>

  <!-- Resolution & SLA -->
  <div style="display:flex;gap:12px;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:50%;padding-right:6px;vertical-align:top;">
        <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Avg Resolution Time</div>
          <div style="font-size:22px;font-weight:700;color:#e5e7eb;">
            ${avgResolutionMs !== null ? fmtDuration(avgResolutionMs) : "—"}
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">across ${closed.length} closed ticket${closed.length !== 1 ? "s" : ""}</div>
        </div>
      </td>
      <td style="width:50%;padding-left:6px;vertical-align:top;">
        <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">SLA Compliance</div>
          <div style="font-size:22px;font-weight:700;color:${slaRate !== null && slaRate >= 80 ? "#34d399" : slaRate !== null && slaRate >= 50 ? "#fbbf24" : "#f87171"};">
            ${slaRate !== null ? `${slaRate}%` : "—"}
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${onTime} of ${closedWithSla.length} on time</div>
        </div>
      </td>
    </tr>
    </table>
  </div>

  <!-- Tag breakdown -->
  ${tagBreakdown.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;margin-bottom:12px;">Tickets by Category</div>
    ${tagBreakdown.map(([tag, count]) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span style="color:#e5e7eb;font-weight:600;">${escapeHtml(tag)}</span>
          <span style="color:#6b7280;">${count}</span>
        </div>
        ${bar(count, maxTag, TAG_COLORS[tag] || "#6b7280")}
      </div>`).join("")}
  </div>` : ""}

  <!-- Busiest locations -->
  ${topLocations.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;margin-bottom:12px;">Busiest Locations</div>
    ${topLocations.map(([loc, count], i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;${i < topLocations.length - 1 ? "border-bottom:1px solid #1e2030;" : ""}">
        <span style="font-size:13px;color:#e5e7eb;">📍 ${escapeHtml(loc)}</span>
        <span style="font-size:12px;font-weight:700;background:#1e2030;color:#9ca3af;padding:2px 9px;border-radius:99px;">${count} ticket${count !== 1 ? "s" : ""}</span>
      </div>`).join("")}
  </div>` : ""}

  <!-- Tickets opened this week -->
  ${opened.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#818cf8;margin-bottom:12px;">Opened This Week (${opened.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${opened.slice(0, 10).map((t: any) => ticketRow(t, true)).join("")}
    </table>
    ${opened.length > 10 ? `<div style="font-size:12px;color:#6b7280;margin-top:8px;text-align:center;">+ ${opened.length - 10} more</div>` : ""}
  </div>` : ""}

  <!-- Tickets closed this week -->
  ${closed.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#34d399;margin-bottom:12px;">Closed This Week (${closed.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${closed.slice(0, 10).map((t: any) => ticketRow(t)).join("")}
    </table>
    ${closed.length > 10 ? `<div style="font-size:12px;color:#6b7280;margin-top:8px;text-align:center;">+ ${closed.length - 10} more</div>` : ""}
  </div>` : ""}

  <!-- Projects -->
  ${projects.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#fbbf24;margin-bottom:12px;">Projects Active This Week (${projects.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${projects.map((p: any) => `
        <tr style="border-bottom:1px solid #1e2030;">
          <td style="padding:10px 0;">
            <a href="${SITE_URL}/projects/${escapeHtml(p.id)}" style="font-size:13px;font-weight:600;color:#c7d2fe;text-decoration:none;">
              ${escapeHtml(p.title)}
            </a>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">
              📍 ${escapeHtml(p.location || "—")}
              &nbsp;·&nbsp;<span style="color:${p.status === "closed" ? "#34d399" : "#fbbf24"};font-weight:600;">${p.status === "closed" ? "Closed" : "Open"}</span>
            </div>
          </td>
          <td style="text-align:right;padding:10px 0;white-space:nowrap;font-size:11px;color:#6b7280;">${fmtDateTime(p.created_at)}</td>
        </tr>`).join("")}
    </table>
  </div>` : ""}

  <!-- Footer -->
  <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #1e2030;">
    <a href="${SITE_URL}" style="display:inline-block;background:#1e2030;color:#818cf8;font-size:13px;padding:10px 22px;border-radius:8px;text-decoration:none;border:1px solid #2d3147;">
      Open SWOEMS Dashboard
    </a>
    <div style="font-size:11px;color:#374151;margin-top:14px;">
      SWOEMS · SeaWorld Entertainment Maintenance System<br/>
      Weekly summary for the period ${weekStartLabel} – ${weekEndLabel}
    </div>
  </div>

</div>
</body>
</html>`;

    // ── Send ─────────────────────────────────────────────────────────────────
    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.error("[weekly-summary] Missing RESEND env vars");
      return { statusCode: 500, body: "Email not configured." };
    }

    const subject = `📊 SWOEMS Weekly Summary · ${weekStartLabel} – ${weekEndLabel}`;

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("[weekly-summary] Resend error:", sendRes.status, errBody);
      return { statusCode: 500, body: `Resend error: ${sendRes.status}` };
    }

    console.log(`[weekly-summary] Sent to ${recipients.length} admins — ${opened.length} opened, ${closed.length} closed.`);
    return { statusCode: 200, body: `OK — ${recipients.length} admins, ${opened.length} opened, ${closed.length} closed.` };

  } catch (e: any) {
    console.error("[weekly-summary] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Server error" };
  }
};
