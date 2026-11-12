/**
 * Netlify Scheduled Function
 * Runs every 30 minutes from 8:00 AM to 6:00 PM Eastern.
 * If the lake fountains have NOT been acknowledged today, posts a reminder to GroupMe.
 * Once acknowledged, stays silent for the rest of the day.
 *
 * Netlify doesn't support sub-hourly cron natively — we schedule it every 30 min
 * using two cron entries in netlify.toml (one at :00 and one at :30).
 * This function handles the "should I fire?" logic itself, checking the ET hour
 * so it only nags between 8 AM and 6 PM.
 *
 * Cron entries (UTC):
 *   EDT (UTC-4): 8am=12:00, 6pm=22:00  → "0,30 12-21 * * *" (summer)
 *   EST (UTC-5): 8am=13:00, 6pm=23:00  → "0,30 13-22 * * *" (winter)
 *   We use "0,30 12-22 * * *" to cover both — outside the window this function
 *   checks the ET hour and exits silently.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { postGroupMe } from "./_groupme";
import { todayBusinessDay, businessDayRange } from "./_eod-day";

const TZ = "America/New_York";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// First live date — won't post before this date (YYYY-MM-DD ET)
const LIVE_DATE = "2026-11-13";

function etHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false })
      .formatToParts(new Date())
      .find(p => p.type === "hour")?.value ?? 0
  );
}

export const handler: Handler = async () => {
  try {
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    if (todayET < LIVE_DATE) {
      console.log(`[fountain-reminder] Before live date (${todayET} < ${LIVE_DATE}). Skipping.`);
      return { statusCode: 200, body: "Before live date." };
    }

    const hour = etHour();

    // Only remind between 8 AM and 6 PM ET (after the morning alert, before EOD)
    if (hour < 8 || hour >= 18) {
      console.log(`[fountain-reminder] Outside reminder window (ET hour: ${hour}). Skipping.`);
      return { statusCode: 200, body: "Outside window." };
    }

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();
    const { start, end } = businessDayRange(day);

    const { data: ack } = await supabase
      .from("fountain_acknowledgments")
      .select("id")
      .gte("acked_at", start)
      .lte("acked_at", end)
      .limit(1)
      .maybeSingle();

    if (ack) {
      console.log(`[fountain-reminder] Already acknowledged today. No reminder needed.`);
      return { statusCode: 200, body: "Already acknowledged." };
    }

    const ackUrl = `${SITE_BASE_URL}/fountain-ack`;

    const message = [
      `⚠️ REMINDER — Lake Fountains not yet confirmed today.`,
      ``,
      `Please verify the fountains are ON and sign off:`,
      ackUrl,
    ].join("\n");

    await postGroupMe(message);
    console.log(`[fountain-reminder] Posted reminder (ET hour: ${hour}).`);
    return { statusCode: 200, body: "Reminder sent." };
  } catch (e: any) {
    console.error("[fountain-reminder] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
