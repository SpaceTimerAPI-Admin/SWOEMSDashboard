/**
 * POST /api/snow-ack-submit
 * Records that the logged-in user confirmed Snow Moments were set on the UCI
 * for today's park time. Works the same way as the fountain sign-off:
 * status ("set" | "issue") + required note on issue, one sign-off per business day,
 * GroupMe announcement on a new sign-off. Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { todayBusinessDay, businessDayRange } from "./_eod-day";
import { postGroupMe } from "./_groupme";

const COLS = "id, employee_id_text, employee_name, acked_at, business_day, lat, lon, status, note";

function fmtTimeET(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function buildGroupMeMessage(ack: { employee_name: string; acked_at: string; status: string; note?: string | null }): string {
  const ok = ack.status !== "issue";
  return [
    `${ok ? "✅" : "⚠️"} Snow Moments Sign-off Complete — ${fmtTimeET(ack.acked_at)}`,
    "",
    ok
      ? "❄️ Snow Moments: Set on the UCI for today's park time"
      : `⚠️ Snow Moments: Issue — ${ack.note || "No details provided"}`,
    "",
    `Signed by: ${ack.employee_name}`,
  ].join("\n");
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const emp  = session.employee as any;
    const body = event.body ? JSON.parse(event.body) : {};

    const lat = typeof body.lat === "number" ? body.lat : null;
    const lon = typeof body.lon === "number" ? body.lon : null;

    const status: "set" | "issue" = body.status === "issue" ? "issue" : "set";
    const note: string | null = status === "issue" && typeof body.note === "string" ? body.note.trim() || null : null;
    if (status === "issue" && !note) return json({ ok: false, error: "Please describe the issue." }, 400);

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();
    const { start, end } = businessDayRange(day);

    // One sign-off per business day — if it's already signed, return that record.
    const { data: existing } = await supabase
      .from("snow_acknowledgments")
      .select(COLS)
      .gte("acked_at", start)
      .lte("acked_at", end)
      .order("acked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return json({ ok: true, ack: existing });

    const { data, error } = await supabase
      .from("snow_acknowledgments")
      .insert({
        employee_id:      emp.id,
        employee_id_text: emp.employee_id,
        employee_name:    emp.name,
        business_day:     day,
        acked_at:         new Date().toISOString(),
        lat, lon, status, note,
      })
      .select(COLS)
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    // Must be awaited — Netlify freezes the function the moment it returns.
    try {
      await postGroupMe(buildGroupMeMessage(data));
    } catch (e: any) {
      console.error("[snow-ack-submit] GroupMe post failed:", e?.message);
    }

    return json({ ok: true, ack: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
