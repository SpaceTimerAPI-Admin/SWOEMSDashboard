/**
 * Netlify Scheduled Function — runs daily at 11:59 PM Eastern Time.
 * Cron: "59 23 * * *" in UTC-adjusted = "59 3 * * *" (UTC, since ET is UTC-4 in summer / UTC-5 in winter).
 * We use "59 4 * * *" UTC as a safe year-round value (11:59 PM ET in winter = 4:59 AM UTC next day).
 *
 * Builds the public EOD report URL for today and posts it to GroupMe.
 */
import type { Handler } from "@netlify/functions";
import { postGroupMe } from "./_groupme";

// Netlify scheduled functions receive a special event — no auth needed.
export const handler: Handler = async () => {
  try {
    const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      console.error("[eod-scheduled] SITE_BASE_URL not set");
      return { statusCode: 500, body: "SITE_BASE_URL not configured" };
    }

    // Get today's date in ET (en-CA locale gives YYYY-MM-DD)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const reportUrl = `${base}/api/eod-report?date=${today}`;

    const msg = `📋 End of Day Report — ${today}\n${reportUrl}`;
    await postGroupMe(msg);

    console.log(`[eod-scheduled] Posted EOD report link for ${today}`);
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[eod-scheduled] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
