/**
 * Scheduled: Every Monday at 7 AM ET (11:00 UTC) — same time as weekly-summary.
 * Sends tag-specific weekly digests:
 *   - "Sound" tag recap → Kalib's account
 *   - "Lighting" tag recap → Adam's account
 *
 * Matches the exact same layout as weekly-summary.ts but filtered to one tag,
 * and addressed to the right person by name.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";
const SITE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// Tag → recipient name mapping.
// The recipient is looked up by name (case-insensitive partial match) from employees.
// Add more entries here whenever new tag recaps are needed.
const TAG_RECIPIENTS: { tag: string; recipientName: string }[] = [
  { tag: "Sound",    recipientName: "Kalib" },
  { tag: "Lighting", recipientName: "Adam"  },
];

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
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function bar(value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div style="background:#1e2030;border-radius:99px;height:8px;overflow:hidden;margin-top:4px;"><div style="width:${pct}%;height:100%;background:${color};border-radius:99px;"></div></div>`;
}

function buildTagEmail(opts: {
  tag: string; recipientName: string;
  opened: any[]; closed: any[]; stillOpen: any[];
  weekStartLabel: string; weekEndLabel: string;
  now: Date;
}): string {
  const { tag, recipientName, opened, closed, stillOpen, weekStartLabel, weekEndLabel, now } = opts;

  const overdueNow = stillOpen.filter((t: any) => new Date(t.sla_due_at) < now);

  const resolutionTimes = closed
    .filter((t: any) => t.created_at && t.closed_at)
    .map((t: any) => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
  const avgResMs = resolutionTimes.length > 0
    ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
    : null;

  const closedWithSla = closed.filter((t: any) => t.closed_at && t.sla_due_at);
  const onTime = closedWithSla.filter((t: any) => new Date(t.closed_at) <= new Date(t.sla_due_at)).length;
  const slaRate = closedWithSla.length > 0 ? Math.round((onTime / closedWithSla.length) * 100) : null;

  // Location breakdown
  const locCount: Record<string, number> = {};
  for (const t of opened) {
    const loc = t.location || "Unknown";
    locCount[loc] = (locCount[loc] || 0) + 1;
  }
  const topLocations = Object.entries(locCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const TAG_COLOR: Record<string, string> = {
    Lighting: "#818cf8", Sound: "#34d399", Video: "#f59e0b", Rides: "#f87171", Misc: "#9ca3af",
  };
  const color = TAG_COLOR[tag] || "#9ca3af";

  const statBox = (v: string | number, label: string, c: string) => `
    <td style="text-align:center;padding:12px 8px;">
      <div style="font-size:28px;font-weight:800;color:${c};">${v}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
    </td>`;

  const ticketRow = (t: any) => `
    <tr style="border-bottom:1px solid #1e2030;">
      <td style="padding:10px 0;">
        <a href="${SITE_URL}/tickets/${escapeHtml(t.id)}" style="font-size:13px;font-weight:600;color:#c7d2fe;text-decoration:none;">
          ${escapeHtml(t.title)}
        </a>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">
          📍 ${escapeHtml(t.location || "—")}
          ${t.status === "open" && new Date(t.sla_due_at) < now ? `&nbsp;·&nbsp;<span style="color:#f87171;font-weight:700;">OVERDUE</span>` : ""}
        </div>
      </td>
      <td style="text-align:right;padding:10px 0;white-space:nowrap;font-size:11px;color:#6b7280;">
        ${t.closed_at ? fmtDateTime(t.closed_at) : fmtDateTime(t.created_at)}
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px 48px;">

  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">SeaWorld Entertainment Maintenance</div>
    <h1 style="margin:0;font-size:26px;color:#e5e7eb;font-weight:800;">
      <span style="color:${color};">●</span> ${tag} Weekly Recap
    </h1>
    <div style="font-size:13px;color:#6b7280;margin-top:6px;">${weekStartLabel} – ${weekEndLabel} · Hi ${escapeHtml(recipientName)}</div>
  </div>

  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;overflow:hidden;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${statBox(opened.length, "Opened", color)}
      ${statBox(closed.length, "Closed", "#34d399")}
      ${statBox(overdueNow.length, "Overdue Now", overdueNow.length > 0 ? "#f87171" : "#6b7280")}
      ${statBox(stillOpen.length, "Still Open", "#fbbf24")}
    </tr></table>
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>
    <td style="width:50%;padding-right:8px;vertical-align:top;">
      <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Avg Resolution</div>
        <div style="font-size:22px;font-weight:700;color:#e5e7eb;">${avgResMs !== null ? fmtDuration(avgResMs) : "—"}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${closed.length} closed</div>
      </div>
    </td>
    <td style="width:50%;padding-left:8px;vertical-align:top;">
      <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">SLA Compliance</div>
        <div style="font-size:22px;font-weight:700;color:${slaRate !== null && slaRate >= 80 ? "#34d399" : slaRate !== null && slaRate >= 50 ? "#fbbf24" : "#f87171"};">
          ${slaRate !== null ? `${slaRate}%` : "—"}
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${onTime} of ${closedWithSla.length} on time</div>
      </div>
    </td>
  </tr></table>

  ${topLocations.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;margin-bottom:12px;">Busiest Locations</div>
    ${topLocations.map(([loc, count], i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;${i < topLocations.length - 1 ? "border-bottom:1px solid #1e2030;" : ""}">
        <span style="font-size:13px;color:#e5e7eb;">📍 ${escapeHtml(loc)}</span>
        <span style="font-size:12px;font-weight:700;background:#1e2030;color:#9ca3af;padding:2px 9px;border-radius:99px;">${count}</span>
      </div>`).join("")}
  </div>` : ""}

  ${opened.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${color};margin-bottom:12px;">Opened This Week (${opened.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${opened.slice(0, 10).map(ticketRow).join("")}
    </table>
    ${opened.length > 10 ? `<div style="font-size:12px;color:#6b7280;margin-top:8px;text-align:center;">+ ${opened.length - 10} more</div>` : ""}
  </div>` : ""}

  ${closed.length > 0 ? `
  <div style="background:#161827;border-radius:12px;border:1px solid #2d3147;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#34d399;margin-bottom:12px;">Closed This Week (${closed.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${closed.slice(0, 10).map(ticketRow).join("")}
    </table>
    ${closed.length > 10 ? `<div style="font-size:12px;color:#6b7280;margin-top:8px;text-align:center;">+ ${closed.length - 10} more</div>` : ""}
  </div>` : ""}

  <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #1e2030;">
    <a href="${SITE_URL}/tickets" style="display:inline-block;background:#1e2030;color:${color};font-size:13px;padding:10px 22px;border-radius:8px;text-decoration:none;border:1px solid #2d3147;">
      View All ${tag} Tickets
    </a>
    <div style="font-size:11px;color:#374151;margin-top:14px;">SWOEMS · SeaWorld Entertainment Maintenance System</div>
  </div>

</div></body></html>`;
}

export const handler: Handler = async () => {
  const supabase = supabaseAdmin();
  const now = new Date();

  const weekEnd = now.toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStartLabel = fmtDate(weekStart);
  const weekEndLabel = fmtDate(weekEnd);

  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("[tag-recap] Missing RESEND env vars");
    return { statusCode: 500, body: "Email not configured." };
  }

  let sentCount = 0;

  for (const { tag, recipientName } of TAG_RECIPIENTS) {
    try {
      // Look up recipient by name (case-insensitive partial match), active only
      const { data: matchedEmps } = await supabase
        .from("employees")
        .select("id, name, email, is_active")
        .ilike("name", `${recipientName}%`)
        .eq("is_active", true)
        .limit(1);

      const emp = matchedEmps?.[0];
      if (!emp?.email) {
        console.warn(`[tag-recap] No active employee found matching "${recipientName}" for ${tag} recap`);
        continue;
      }

      // Fetch this tag's tickets for the week
      const [openedRes, closedRes, stillOpenRes] = await Promise.all([
        supabase.from("tickets")
          .select("id, title, location, tag, status, created_at, closed_at, sla_due_at")
          .eq("tag", tag).gte("created_at", weekStart).lte("created_at", weekEnd)
          .order("created_at", { ascending: false }),
        supabase.from("tickets")
          .select("id, title, location, tag, created_at, closed_at, sla_due_at, sla_minutes")
          .eq("tag", tag).eq("status", "closed")
          .gte("closed_at", weekStart).lte("closed_at", weekEnd)
          .order("closed_at", { ascending: false }),
        supabase.from("tickets")
          .select("id, title, location, tag, created_at, sla_due_at")
          .eq("tag", tag).eq("status", "open")
          .order("sla_due_at", { ascending: true }),
      ]);

      const opened = openedRes.data || [];
      const closed = closedRes.data || [];
      const stillOpen = stillOpenRes.data || [];

      // Skip if nothing happened this week for this tag
      if (opened.length === 0 && closed.length === 0 && stillOpen.length === 0) {
        console.log(`[tag-recap] No ${tag} activity this week — skipping email to ${emp.name}`);
        continue;
      }

      const html = buildTagEmail({ tag, recipientName: emp.name, opened, closed, stillOpen, weekStartLabel, weekEndLabel, now });
      const subject = `${tag === "Sound" ? "🎵" : tag === "Lighting" ? "💡" : "📊"} ${tag} Weekly Recap · ${weekStartLabel} – ${weekEndLabel}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ from, to: [emp.email], subject, html }),
      });

      if (res.ok) {
        sentCount++;
        console.log(`[tag-recap] Sent ${tag} recap to ${emp.name} (${emp.email})`);
      } else {
        const err = await res.text();
        console.error(`[tag-recap] Resend error for ${tag}/${emp.email}:`, res.status, err);
      }
    } catch (e: any) {
      console.error(`[tag-recap] Error for ${tag}:`, e?.message);
    }
  }

  return { statusCode: 200, body: `OK — ${sentCount} tag recap emails sent.` };
};
