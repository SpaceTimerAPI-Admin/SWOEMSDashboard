/**
 * Netlify Scheduled Function — runs daily at 11:59 PM Eastern Time.
 * schedule = "59 4 * * *" UTC (= 11:59 PM ET in winter, 12:59 AM ET in summer — close enough)
 */
import type { Handler } from "@netlify/functions";
import { postGroupMe } from "./_groupme";
import { supabaseAdmin } from "./_supabase";

export const handler: Handler = async () => {
  try {
    const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      console.error("[eod-scheduled] SITE_BASE_URL not set");
      return { statusCode: 500, body: "SITE_BASE_URL not configured" };
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const start = new Date(today + "T00:00:00").toISOString();
    const end   = new Date(today + "T23:59:59.999").toISOString();

    const supabase = supabaseAdmin();

    // Counts for today
    const [todayTickets, todayProjects, closedTickets, closedProjects, allOpenTickets, allOpenProjects] = await Promise.all([
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("projects").select("id", { count: "exact", head: true }).gte("closed_at", start).lte("closed_at", end),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const todayTotal  = (todayTickets.count || 0) + (todayProjects.count || 0);
    const closedToday = (closedTickets.count || 0) + (closedProjects.count || 0);
    const openAll     = (allOpenTickets.count || 0) + (allOpenProjects.count || 0);

    const reportUrl = `${base}/api/eod-report?date=${today}`;

    const lines = [
      `📋 End of Day Report — ${today}`,
      ``,
      `🎫 Logged today: ${todayTotal}`,
      `✅ Closed today: ${closedToday}`,
      `⏳ Still open (all): ${openAll}`,
      ``,
      reportUrl,
    ];

    await postGroupMe(lines.join("\n"));

    console.log(`[eod-scheduled] Posted EOD summary for ${today}`);
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[eod-scheduled] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
