/**
 * Netlify Scheduled Function
 * Runs at 4:30 AM Eastern every day and posts the PREVIOUS business day's EOD report to GroupMe.
 *
 * Business day = 4:00 AM ET to 3:59:59 AM ET the next day. So this fires just after
 * the cutoff closes, ensuring all of "yesterday" (4am-4am) is captured before posting.
 *
 * Example: runs at 4:30 AM on Friday April 10 → posts Thursday April 9's business-day report
 * (which covers Thu 4:00 AM through Fri 3:59 AM).
 *
 * Cron in UTC:
 *   4:30 AM EDT (summer) = 8:30 AM UTC
 *   4:30 AM EST (winter) = 9:30 AM UTC
 *   Using "30 8 * * *" — fires at 4:30 AM in summer, 3:30 AM in winter. Close enough year-round.
 */
import type { Handler } from "@netlify/functions";
import { postGroupMe } from "./_groupme";
import { supabaseAdmin } from "./_supabase";
import { businessDayRange, previousBusinessDay, TZ } from "./_eod-day";

export const handler: Handler = async () => {
  try {
    const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      console.error("[eod-scheduled] SITE_BASE_URL not set");
      return { statusCode: 500, body: "SITE_BASE_URL not configured" };
    }

    // We run at 4:30 AM — the 4 AM cutoff just closed, so "today" is the new business day.
    // We want to report on the day that JUST finished, which is the PREVIOUS business day.
    const reportDay = previousBusinessDay();
    const { start, end } = businessDayRange(reportDay);

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

    const friendlyDate = new Date(`${reportDay}T12:00:00`).toLocaleDateString("en-US", {
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

    console.log(`[eod-scheduled] Posted EOD summary for business day ${reportDay}`);
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[eod-scheduled] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
