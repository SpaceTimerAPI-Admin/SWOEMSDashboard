/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Accepts image (jpeg/png) or PDF.
 * Sends to Claude vision to extract the schedule.
 * Upserts entries — uploading again only adds/updates, never deletes.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

interface ScheduleEntry {
  employee_name: string;
  work_date: string;       // YYYY-MM-DD
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

    // Determine source type — Claude accepts images and PDFs
    const isPdf = content_type === "application/pdf";
    const source = isPdf
      ? { type: "base64" as const, media_type: "application/pdf" as const, data: image_base64 }
      : { type: "base64" as const, media_type: content_type as any, data: image_base64 };

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            isPdf
              ? { type: "document", source }
              : { type: "image", source },
            {
              type: "text",
              text: `You are reading a SeaWorld weekly work schedule table. Extract every person's shift for each day they are working.

CRITICAL — SECOND SHIFTS:
The table has employee names in the FAR LEFT column. When a row has NO name in the far left column but has shift times in day columns, it belongs to the most recent named employee above it. That person has a SECOND shift on that day.

For employees with two shifts on the same day, combine them with " / " separator in all_shifts, e.g. "12:30 PM - 6:00 PM / 11:30 PM - 2:00 AM". Use the start of their first shift as shift_start and end of their last shift as shift_end.

Return ONLY a valid JSON array — no markdown, no explanation, no extra text. Each object must have exactly these fields:
- "employee_name": First name + last initial with period, e.g. "Andy O." — convert from "LASTNAME, FIRSTNAME M" format
- "work_date": YYYY-MM-DD from the column header date
- "shift_start": Start time of first shift e.g. "6:00 AM" — null if unknown
- "shift_end": End time of last shift e.g. "2:30 PM" — null if unknown  
- "all_shifts": The full shift string. Single shift: "6:00 AM - 2:30 PM". Two shifts: "12:30 PM - 6:00 PM / 11:30 PM - 2:00 AM"

Rules:
- Skip cells that say "Off", "OFF", or are blank
- Do NOT include location codes like "SWF TECH EMS", "SSFF", "Ad Hoc" — only times
- If a row has NO name on the far left, assign its shifts to the named employee in the row immediately above
- Return only the JSON array, nothing else

Example output:
[
  {"employee_name":"Andy O.","work_date":"2026-05-07","shift_start":"12:30 PM","shift_end":"2:00 AM","all_shifts":"12:30 PM - 6:00 PM / 11:30 PM - 2:00 AM"},
  {"employee_name":"Lori W.","work_date":"2026-05-07","shift_start":"6:00 AM","shift_end":"2:30 PM","all_shifts":"6:00 AM - 2:30 PM"}
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

    let entries: ScheduleEntry[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      entries = JSON.parse(cleaned);
      if (!Array.isArray(entries)) throw new Error("Not an array");
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response:", rawText);
      return json({ ok: false, error: "Could not parse schedule from image. Try a clearer photo or better lighting." }, 422);
    }

    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );

    if (valid.length === 0) {
      return json({ ok: false, error: "No schedule entries found. Try a clearer or closer photo." }, 422);
    }

    // Deduplicate — if Claude returned two entries for the same person+date
    // (named row + second shift row separately), merge them into one
    const mergeMap = new Map<string, any>();
    for (const e of valid as any[]) {
      const key = `${e.work_date}::${e.employee_name}`;
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...e });
      } else {
        const existing = mergeMap.get(key);
        // Combine shifts — keep earliest start, latest end, merge all_shifts
        if (e.shift_start && (!existing.shift_start || e.shift_start < existing.shift_start)) {
          existing.shift_start = e.shift_start;
        }
        if (e.shift_end && (!existing.shift_end || e.shift_end > existing.shift_end)) {
          existing.shift_end = e.shift_end;
        }
        if (e.all_shifts && existing.all_shifts && e.all_shifts !== existing.all_shifts) {
          existing.all_shifts = `${existing.all_shifts} / ${e.all_shifts}`;
        } else if (e.all_shifts && !existing.all_shifts) {
          existing.all_shifts = e.all_shifts;
        }
      }
    }
    const deduped = Array.from(mergeMap.values());

    const supabase = supabaseAdmin();
    const rows = deduped.map((e: any) => ({
      work_date: e.work_date,
      employee_name: e.employee_name,
      shift_start: e.shift_start || null,
      shift_end: e.shift_end || null,
      all_shifts: e.all_shifts || null,
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

    const dates = [...new Set(deduped.map((e: any) => e.work_date))].sort();
    return json({ ok: true, count: deduped.length, dates, entries: deduped });

  } catch (e: any) {
    console.error("[schedule-upload] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
