/**
 * Netlify Scheduled Function
 * Runs at 2:00 AM Eastern every day and posts the PREVIOUS day's EOD report to GroupMe.
 *
 * Example: runs at 2 AM on the 27th → posts the report for the 26th.
 *
 * Cron in UTC:
 *   ET is UTC-5 in winter, UTC-4 in summer.
 *   2 AM ET winter = 7 AM UTC  → "0 7 * * *"
 *   2 AM ET summer = 6 AM UTC  → "0 6 * * *"
 *   Use "0 7 * * *" as the year-round value (worst case it fires at 3 AM ET in summer — acceptable).
 */
import type { Handler } from "@netlify/functions";
import { postGroupMe } from "./_groupme";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";

function etDayRange(day: string): { start: string; end: string } {
  const offsetMs = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const etMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return d.getTime() - etMs;
  };
  const s = new Date(`${day}T00:00:00`);
  const e = new Date(`${day}T23:59:59.999`);
  return {
    start: new Date(s.getTime() + offsetMs(s)).toISOString(),
    end:   new Date(e.getTime() + offsetMs(e)).toISOString(),
  };
}

export const handler: Handler = async () => {
  try {
    const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      console.error("[eod-scheduled] SITE_BASE_URL not set");
      return { statusCode: 500, body: "SITE_BASE_URL not configured" };
    }

    // We're running in the early hours of "today" — report on yesterday
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDay = yesterday.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

    const { start, end } = etDayRange(reportDay);

    const supabase = supabaseAdmin();

    const [todayTickets, todayProjects, closedTickets, closedProjects, allOpenTickets, allOpenProjects] = await Promise.all([
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const loggedToday  = (todayTickets.count || 0) + (todayProjects.count || 0);
    const closedToday  = (closedTickets.count || 0) + (closedProjects.count || 0);
    const openAllTime  = (allOpenTickets.count || 0) + (allOpenProjects.count || 0);

    const reportUrl = `${base}/api/eod-report?date=${reportDay}`;

    const friendlyDate = yesterday.toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric"
    });

    const lines = [
      `📋 EOD Report — ${friendlyDate}`,
      ``,
      `🎫 Logged: ${loggedToday}`,
      `✅ Closed: ${closedToday}`,
      `⏳ Still open system-wide: ${openAllTime}`,
      ``,
      reportUrl,
    ];

    await postGroupMe(lines.join("\n"));

    console.log(`[eod-scheduled] Posted EOD summary for ${reportDay}`);
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[eod-scheduled] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
