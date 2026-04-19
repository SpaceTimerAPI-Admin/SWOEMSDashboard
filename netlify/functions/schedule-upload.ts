/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Sends the image to Claude vision to extract the schedule,
 * then upserts entries into schedule_entries (by work_date + employee_name).
 * Uploading a new photo for dates that already exist updates them (revision support).
 * Dates not present in the new image are untouched.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

interface ScheduleEntry {
  employee_name: string;  // "First L." format
  work_date: string;      // YYYY-MM-DD
  shift_start: string | null;
  shift_end: string | null;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const image_base64 = String(body.image_base64 || "").trim();
    const content_type = String(body.content_type || "image/jpeg").trim();

    if (!image_base64) return badRequest("image_base64 required");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return badRequest("ANTHROPIC_API_KEY not configured");

    // Call Claude vision to parse the schedule
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: content_type, data: image_base64 },
            },
            {
              type: "text",
              text: `You are reading a weekly work schedule. Extract every person's shift for each day they are working (not Off and not blank).

Return ONLY a JSON array with no other text, markdown, or explanation. Each object must have:
- "employee_name": First name + last initial with a period, e.g. "Andy O." — use exactly this format
- "work_date": The date in YYYY-MM-DD format (read the date from the column header)
- "shift_start": Start time as shown, e.g. "6:00 AM" — null if unknown
- "shift_end": End time as shown, e.g. "2:30 PM" — null if unknown

Rules:
- Skip any cell that says "Off", "OFF", or is blank
- Skip any cell with no time information
- Do NOT include any location or department codes (like SWF TECH EMS) — only name, date, and times
- Names appear as "LASTNAME, FIRSTNAME M" — convert to "Firstname L." format
- If a person has multiple shifts in one cell, use the first time range
- Return only the JSON array, nothing else

Example output:
[
  {"employee_name":"Andy O.","work_date":"2026-04-18","shift_start":"1:00 PM","shift_end":"9:30 PM"},
  {"employee_name":"Lori W.","work_date":"2026-04-18","shift_start":"6:00 AM","shift_end":"2:30 PM"}
]`,
            },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[schedule-upload] Claude API error:", err);
      return json({ ok: false, error: `Vision API error: ${claudeRes.status}` }, 500);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData?.content?.[0]?.text || "";

    // Parse the JSON array from Claude's response
    let entries: ScheduleEntry[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      entries = JSON.parse(cleaned);
      if (!Array.isArray(entries)) throw new Error("Not an array");
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response:", rawText);
      return json({ ok: false, error: "Could not parse schedule from image. Please try a clearer photo." }, 422);
    }

    // Validate and clean entries
    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );

    if (valid.length === 0) {
      return json({ ok: false, error: "No schedule entries found. Try a clearer or closer photo." }, 422);
    }

    // Upsert into Supabase — existing entries for same date+name get updated (revision support)
    const supabase = supabaseAdmin();
    const rows = valid.map(e => ({
      work_date: e.work_date,
      employee_name: e.employee_name,
      shift_start: e.shift_start || null,
      shift_end: e.shift_end || null,
      uploaded_by: session.employee.id,
      uploaded_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("schedule_entries")
      .upsert(rows, { onConflict: "work_date,employee_name" });

    if (upsertError) {
      console.error("[schedule-upload] Supabase upsert error:", upsertError);
      return json({ ok: false, error: upsertError.message }, 500);
    }

    // Return the parsed entries for preview confirmation
    const dates = [...new Set(valid.map(e => e.work_date))].sort();
    return json({
      ok: true,
      count: valid.length,
      dates,
      entries: valid,
    });

  } catch (e: any) {
    console.error("[schedule-upload] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
