/**
 * Netlify Scheduled Function
 * Runs at 6:00 AM Eastern every day.
 * If there are BEO events today, posts a GroupMe alert listing all events
 * with links to their PDFs so openers can review before shift.
 * If there are no events today, does nothing.
 *
 * Cron in UTC:
 *   6:00 AM EDT (summer, UTC-4) = 10:00 AM UTC
 *   6:00 AM EST (winter, UTC-5) = 11:00 AM UTC
 *   Using "0 10 * * *" — fires at 6:00 AM in summer, 5:00 AM in winter.
 *   Close enough year-round for an opener alert.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { postGroupMe } from "./_groupme";

const TZ = "America/New_York";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

export const handler: Handler = async () => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const todayLabel = new Date().toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric",
    });

    const supabase = supabaseAdmin();

    const { data: events, error } = await supabase
      .from("beo_events")
      .select("id, event_name, event_date, pdf_url")
      .eq("event_date", today)
      .is("deleted_at", null)
      .order("event_name");

    if (error) {
      console.error("[beo-morning-alert] Supabase error:", error.message);
      return { statusCode: 500, body: error.message };
    }

    // No events today — stay silent
    if (!events || events.length === 0) {
      console.log(`[beo-morning-alert] No events on ${today} — skipping GroupMe post.`);
      return { statusCode: 200, body: "No events today." };
    }

    // Build the message
    const lines: string[] = [
      `☀️ Good morning! Today is ${todayLabel}.`,
      ``,
      `📋 You have ${events.length} event${events.length > 1 ? "s" : ""} scheduled today:`,
      ``,
    ];

    events.forEach((ev, i) => {
      lines.push(`${i + 1}. ${ev.event_name}`);
      if (ev.pdf_url) {
        lines.push(`   📄 BEO PDF: ${ev.pdf_url}`);
      } else {
        lines.push(`   📄 BEO PDF: ${SITE_BASE_URL}/events/${ev.id}`);
      }
    });

    lines.push(``);
    lines.push(`⚠️ Openers — please review your email and event binder for any updates or inaccuracies.`);

    const message = lines.join("\n");

    await postGroupMe(message);
    console.log(`[beo-morning-alert] Posted alert for ${events.length} event(s) on ${today}.`);
    return { statusCode: 200, body: `OK — alerted ${events.length} event(s).` };

  } catch (e: any) {
    console.error("[beo-morning-alert] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Server error" };
  }
};
