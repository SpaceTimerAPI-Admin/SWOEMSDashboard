/**
 * Scheduled function — fires daily at 4:00 AM ET
 * Posts Christmas ticket stats to GroupMe.
 *
 * Schedule: "0 9 * * *" (9:00 UTC = 4:00 AM ET)
 * Add to netlify.toml:
 *   [[plugins]]
 *   package = "@netlify/plugin-functions-install-core"
 *
 *   [functions.xmas-daily-report]
 *     schedule = "0 9 * * *"
 */
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { postGroupMe } from "./_groupme";

export const handler: Handler = async () => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: tickets, error } = await supabase
      .from("xmas_tickets")
      .select("id, status, created_at");

    if (error) throw new Error(error.message);

    const all = tickets || [];
    const open = all.filter((t: any) => t.status === "open");
    const fixed = all.filter((t: any) => t.status === "fixed");

    // Tickets opened yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const openedYesterday = all.filter((t: any) => new Date(t.created_at) >= yesterday);

    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long", month: "short", day: "numeric",
    });

    const lines = [
      `🎄 Christmas Ticket Report — ${today}`,
      ``,
      `📋 Open (need attention): ${open.length}`,
      `✅ Fixed / Closed: ${fixed.length}`,
      `📝 Logged yesterday: ${openedYesterday.length}`,
      `📊 Total all-time: ${all.length}`,
      ``,
      open.length > 0
        ? `⚠️ ${open.length} ticket${open.length === 1 ? "" : "s"} remain open — priority for today's shift.`
        : `✓ All tickets resolved — great work!`,
      ``,
      `swoems.com/christmas`,
    ];

    await postGroupMe(lines.join("\n"));

    return { statusCode: 200, body: JSON.stringify({ ok: true, open: open.length, fixed: fixed.length }) };
  } catch (e: any) {
    console.error("[xmas-daily-report]", e?.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message }) };
  }
};
