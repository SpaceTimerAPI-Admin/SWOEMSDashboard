/**
 * Netlify Scheduled Function
 * Runs at 3:00 AM Eastern every day and posts the PREVIOUS day's EOD report to GroupMe.
 *
 * Example: runs at 3 AM on Friday April 10 → posts Thursday April 9's report.
 *
 * Cron in UTC:
 *   ET is UTC-4 in summer (EDT), UTC-5 in winter (EST)
 *   3 AM EDT = 7 AM UTC  → "0 7 * * *"
 *   3 AM EST = 8 AM UTC  → "0 8 * * *"
 *   Using "0 7 * * *" — fires at 3 AM in summer, 2 AM in winter. Close enough year-round.
 */
import type { Handler } from "@netlify/functions";
import { postGroupMe } from "./_groupme";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";

export const handler: Handler = async () => {
  try {
    const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      console.error("[eod-scheduled] SITE_BASE_URL not set");
      return { statusCode: 500, body: "SITE_BASE_URL not configured" };
    }

    // We're running in the early hours of "today" — report on YESTERDAY
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get yesterday's date string in ET
    const reportDay = yesterday.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

    // Build ET-correct date range for yesterday
    const offsetMs = (d: Date): number => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).formatToParts(d);
      const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
      const etMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
      return d.getTime() - etMs;
    };
    const s = new Date(`${reportDay}T00:00:00`);
    const e = new Date(`${reportDay}T23:59:59.999`);
    const start = new Date(s.getTime() + offsetMs(s)).toISOString();
    const end   = new Date(e.getTime() + offsetMs(e)).toISOString();

    const supabase = supabaseAdmin();

    const [todayTickets, todayProjects, closedTickets, closedProjects, allOpenTickets, allOpenProjects] = await Promise.all([
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const loggedYesterday = (todayTickets.count || 0) + (todayProjects.count || 0);
    const closedYesterday = (closedTickets.count || 0) + (closedProjects.count || 0);
    const openAllTime     = (allOpenTickets.count || 0) + (allOpenProjects.count || 0);

    const reportUrl = `${base}/api/eod-report?date=${reportDay}`;

    const friendlyDate = yesterday.toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric",
    });

    const lines = [
      `📋 EOD Report — ${friendlyDate}`,
      ``,
      `🎫 Logged: ${loggedYesterday}`,
      `✅ Closed: ${closedYesterday}`,
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
