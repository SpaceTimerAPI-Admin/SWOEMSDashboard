/**
 * Netlify Scheduled Function
 * Runs every 30 minutes. Between 4:30 PM and 8:00 PM Eastern, if Snow Moments has NOT
 * been signed off today, posts a reminder to GroupMe. Silent once it is signed.
 * The first reminder is 4:30 PM — 30 minutes after the 4:00 PM alert.
 *
 * Cron (UTC) covers both EST and EDT; the ET time check below does the real limiting.
 */
import { schedule } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { postGroupMe } from "./_groupme";
import { todayBusinessDay, businessDayRange } from "./_eod-day";

const TZ = "America/New_York";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// Reminder window, in minutes after midnight ET. Change LAST to remind later/earlier.
const FIRST = 16 * 60 + 30; // 4:30 PM
const LAST  = 20 * 60;      // 8:00 PM
const SLACK = 5;            // tolerate the cron firing a few minutes off

function etMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export const handler = schedule("0,30 0,1,20-23 * * *", async () => {
  try {
    const mins = etMinutes();
    if (mins < FIRST - SLACK || mins > LAST + SLACK) {
      console.log(`[snow-reminder] Outside reminder window (ET minutes: ${mins}). Skipping.`);
      return { statusCode: 200, body: "Outside window." };
    }

    const supabase = supabaseAdmin();
    const { start, end } = businessDayRange(todayBusinessDay());

    const { data: ack, error } = await supabase
      .from("snow_acknowledgments")
      .select("id")
      .gte("acked_at", start)
      .lte("acked_at", end)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (ack) {
      console.log("[snow-reminder] Already signed off today. No reminder needed.");
      return { statusCode: 200, body: "Already acknowledged." };
    }

    await postGroupMe([
      `⚠️ REMINDER — Snow Moments not yet signed off today.`,
      ``,
      `Please set Snow Moments on the UCI for the appropriate park time and sign off:`,
      `${SITE_BASE_URL}/daily-signoffs`,
    ].join("\n"));
    console.log(`[snow-reminder] Posted reminder (ET minutes: ${mins}).`);
    return { statusCode: 200, body: "Reminder sent." };
  } catch (e: any) {
    console.error("[snow-reminder] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
});
