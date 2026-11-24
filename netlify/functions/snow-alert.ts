/**
 * Netlify Scheduled Function
 * Runs at 4:00 PM Eastern every day.
 * Posts a GroupMe message asking the team to set Snow Moments on the UCI.
 *
 * 21:00 UTC = 4:00 PM EST (winter, when Snow Moments runs).
 */
import { schedule } from "@netlify/functions";
import { postGroupMe } from "./_groupme";

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");

// Schedule is declared here (in code) as well as in netlify.toml.
export const handler = schedule("0 21 * * *", async () => {
  try {
    const todayLabel = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
    });

    const message = [
      `❄️ Snow Moments — ${todayLabel}`,
      ``,
      `Please set Snow Moments on the UCI corresponding to the appropriate park time.`,
      ``,
      `✅ Sign off here:`,
      `${SITE_BASE_URL}/daily-signoffs`,
    ].join("\n");

    await postGroupMe(message);
    console.log("[snow-alert] Posted 4 PM Snow Moments alert.");
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    console.error("[snow-alert] Error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
});
