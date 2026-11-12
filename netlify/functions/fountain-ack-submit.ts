/**
 * POST /api/fountain-ack-submit
 * Records that the logged-in user has confirmed the lake fountain statuses.
 * Accepts per-fountain status ("on" | "issue") and optional notes.
 * Idempotent — if already acked today, returns existing record.
 * Posts a GroupMe announcement on successful new submission.
 * Auth required.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { todayBusinessDay, businessDayRange } from "./_eod-day";
import { postGroupMe } from "./_groupme";

function fmtTimeET(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function buildGroupMeMessage(ack: {
  employee_name: string;
  acked_at: string;
  bay_side_status: string;
  bay_side_note?: string | null;
  lakeside_status: string;
  lakeside_note?: string | null;
}): string {
  const hasIssues = ack.bay_side_status === "issue" || ack.lakeside_status === "issue";
  const headerEmoji = hasIssues ? (ack.bay_side_status === "issue" && ack.lakeside_status === "issue" ? "🚨" : "⚠️") : "✅";

  const dateStr = fmtTimeET(ack.acked_at);

  const bayLine = ack.bay_side_status === "on"
    ? "🌊 Bay Side Fountains: On & Functioning"
    : `⚠️ Bay Side Fountains: Issue — ${ack.bay_side_note || "No details provided"}`;

  const lakeLine = ack.lakeside_status === "on"
    ? "🌊 Lakeside Fountains: On & Functioning"
    : `⚠️ Lakeside Fountains: Issue — ${ack.lakeside_note || "No details provided"}`;

  return [
    `${headerEmoji} Lake Fountain Check-off Complete — ${dateStr}`,
    "",
    bayLine,
    lakeLine,
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

    // GPS
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lon = typeof body.lon === "number" ? body.lon : null;

    // Fountain statuses — default "on" if not provided (shouldn't happen from UI)
    const bay_side_status: "on" | "issue" = body.bay_side_status === "issue" ? "issue" : "on";
    const bay_side_note:   string | null  = bay_side_status === "issue" && typeof body.bay_side_note === "string" ? body.bay_side_note.trim() || null : null;
    const lakeside_status: "on" | "issue" = body.lakeside_status === "issue" ? "issue" : "on";
    const lakeside_note:   string | null  = lakeside_status === "issue" && typeof body.lakeside_note === "string" ? body.lakeside_note.trim() || null : null;

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();
    const { start, end } = businessDayRange(day);

    // Idempotent — if already acked today, just return it
    const { data: existing } = await supabase
      .from("fountain_acknowledgments")
      .select("id, employee_id_text, employee_name, acked_at, business_day, lat, lon, bay_side_status, bay_side_note, lakeside_status, lakeside_note")
      .gte("acked_at", start)
      .lte("acked_at", end)
      .order("acked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return json({ ok: true, ack: existing });

    // Insert new acknowledgment
    const { data, error } = await supabase
      .from("fountain_acknowledgments")
      .insert({
        employee_id:      emp.id,
        employee_id_text: emp.employee_id,
        employee_name:    emp.name,
        business_day:     day,
        acked_at:         new Date().toISOString(),
        lat,
        lon,
        bay_side_status,
        bay_side_note,
        lakeside_status,
        lakeside_note,
      })
      .select("id, employee_id_text, employee_name, acked_at, business_day, lat, lon, bay_side_status, bay_side_note, lakeside_status, lakeside_note")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    // Post GroupMe announcement (fire-and-forget — don't block the response)
    const msg = buildGroupMeMessage(data);
    postGroupMe(msg).catch(() => { /* silent — GroupMe failure shouldn't break the sign-off */ });

    return json({ ok: true, ack: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
