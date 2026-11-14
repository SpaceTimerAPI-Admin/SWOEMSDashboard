/**
 * Netlify Scheduled Function
 * Runs at 8:00 AM Eastern every day.
 * Posts a GroupMe message asking the team to confirm the lake fountains are on.
 *
 * Cron in UTC:
 *   8:00 AM EDT (summer, UTC-4) = 12:00 PM UTC
 *   8:00 AM EST (winter, UTC-5) = 13:00 PM UTC
 *   Using "0 13 * * *" — fires at 8:00 AM in winter, 9:00 AM in summer.
 *   For summer accuracy use "0 12 * * *". Splitting the diff: "0 12 * * *" is better
 *   since the fountains run seasonally and this will be active in summer months.
 */
import { schedule } from "@netlify/functions";
import { postGroupMe } from "./_groupme";

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// Schedule is declared HERE (in code) as well as in netlify.toml, so it cannot be lost
// if netlify.toml is not updated. 13:00 UTC = 8:00 AM EST.
export const handler = schedule("0 13 * * *", async () => {
  try {
    const todayLabel = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
    });

    const ackUrl = `${SITE_BASE_URL}/fountain-ack`;

    const message = [
      `💧 Good morning! — ${todayLabel}`,
      ``,
      `Please confirm the Lake Fountains are ON and functioning.`,
      ``,
      `✅ Sign off here:`,
      ackUrl,
    ].join("\n");

    await postGroupMe(message);
    console.log("[fountain-morning-alert] Posted morning fountain check.");
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[fountain-morning-alert] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
});
