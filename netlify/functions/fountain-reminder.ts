/**
 * Netlify Scheduled Function
 * Runs every 30 minutes from 8:30 AM to 6:00 PM Eastern.
 * The first reminder is 8:30 AM — 30 minutes after the 8:00 AM morning alert,
 * so the two never post at the same time.
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
import { schedule } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { postGroupMe } from "./_groupme";
import { todayBusinessDay, businessDayRange } from "./_eod-day";

const TZ = "America/New_York";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// Reminder window, in minutes after midnight ET.
const FIRST = 8 * 60 + 30; // 8:30 AM — 30 min after the morning alert
const END   = 18 * 60;     // stop at 6:00 PM (last reminder 5:30 PM)
const SLACK = 5;           // tolerate the cron firing a few minutes off

function etMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

// Schedule is declared HERE (in code) as well as in netlify.toml.
// Every 30 min, 12:00-22:30 UTC; the ET time check below limits it to 8:30 AM - 6 PM ET.
export const handler = schedule("0,30 12-22 * * *", async () => {
  try {
    const mins = etMinutes();

    // Only remind from 8:30 AM to 6 PM ET (30 min after the morning alert, before EOD)
    if (mins < FIRST - SLACK || mins >= END) {
      console.log(`[fountain-reminder] Outside reminder window (ET minutes: ${mins}). Skipping.`);
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

    const ackUrl = `${SITE_BASE_URL}/daily-signoffs`;

    const message = [
      `⚠️ REMINDER — Lake Fountains not yet confirmed today.`,
      ``,
      `Please verify the fountains are ON and sign off:`,
      ackUrl,
    ].join("\n");

    await postGroupMe(message);
    console.log(`[fountain-reminder] Posted reminder (ET minutes: ${mins}).`);
    return { statusCode: 200, body: "Reminder sent." };
  } catch (e: any) {
    console.error("[fountain-reminder] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
});
