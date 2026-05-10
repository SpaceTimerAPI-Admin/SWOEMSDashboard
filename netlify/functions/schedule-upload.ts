/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Accepts image (jpeg/png) or PDF.
 * For each date range covered by the upload:
 *   - Upserts new/updated entries
 *   - Deletes entries for employees NOT present on those dates (handles removed shifts)
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

interface ScheduleEntry {
  employee_name: string;
  work_date: string;
  shift_start: string | null;
  shift_end: string | null;
  all_shifts: string | null;
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

    const isPdf = content_type === "application/pdf";
    const source = isPdf
      ? { type: "base64" as const, media_type: "application/pdf" as const, data: image_base64 }
      : { type: "base64" as const, media_type: content_type as any, data: image_base64 };

    const contentBlock = isPdf
      ? { type: "document", source }
      : { type: "image", source };

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",  // Faster model — better for document parsing
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `You are reading a SeaWorld weekly work schedule table.

FIRST: Read the column header row carefully. It contains dates like "Thursday 5/7/2026", "Friday 5/8/2026" etc. List every date column in order from left to right. This is your date map — every shift must be anchored to its exact column header date.

SECOND: For each employee, go column by column left to right using your date map. For each column:
- If the cell contains a time range → record it under that column's exact date
- If the cell says "Off", "OFF", "PTO", or is blank → skip it
- Strip all location text (SWF TECH EMS, SSFF, Ad Hoc, EO, Purchasing Position, etc) — keep times only

THIRD — SECOND SHIFTS: A row with NO employee name in the far-left column means the employee directly above has a second shift. Merge with " / " e.g. "12:30 PM - 6:00 PM / 11:30 PM - 2:00 AM"

Return ONLY a JSON array, nothing else. Each object:
{
  "employee_name": "Firstname L.",
  "work_date": "YYYY-MM-DD",
  "shift_start": "6:00 AM",
  "shift_end": "2:30 PM",
  "all_shifts": "6:00 AM - 2:30 PM"
}

Names are formatted as "LASTNAME, FIRSTNAME M" — convert to "Firstname L." format.
Do not include "Off" days. Do not skip any date column. Do not shift columns.`,
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

    const responseText = await claudeRes.text();

    // Detect gateway timeout / HTML error pages before attempting JSON parse
    if (responseText.trim().startsWith("<") || responseText.includes("Inactivity Timeout")) {
      console.error("[schedule-upload] Gateway timeout or HTML error returned");
      return json({ ok: false, error: "The request timed out. Try uploading a photo of the schedule instead of a PDF, or crop the image closer to the schedule." }, 504);
    }

    const claudeData = JSON.parse(responseText);
    const rawText = claudeData?.content?.[0]?.text || "";

    let entries: ScheduleEntry[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      // Find the JSON array even if there's surrounding text
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found");
      entries = JSON.parse(match[0]);
      if (!Array.isArray(entries)) throw new Error("Not an array");
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response:", rawText);
      return json({ ok: false, error: "Could not parse schedule. Try a clearer photo or check the PDF." }, 422);
    }

    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );

    if (valid.length === 0) {
      return json({ ok: false, error: "No schedule entries found in the upload." }, 422);
    }

    // Sanity check — all dates should be within a reasonable 14-day window
    // (catches cases where Claude reads a date from a different part of the doc)
    const dateCounts = new Map<string, number>();
    for (const e of valid as any[]) {
      dateCounts.set(e.work_date, (dateCounts.get(e.work_date) || 0) + 1);
    }
    // Find the "center of mass" date
    const allMs = [...dateCounts.keys()].map(d => new Date(d + "T12:00:00").getTime());
    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const spanDays = (maxMs - minMs) / 86400000;
    // If dates span more than 14 days something is wrong — filter to the densest 7-day window
    let filtered = valid as any[];
    if (spanDays > 14) {
      const medianMs = allMs.sort((a, b) => a - b)[Math.floor(allMs.length / 2)];
      const windowMs = 7 * 86400000;
      filtered = valid.filter((e: any) => {
        const ms = new Date(e.work_date + "T12:00:00").getTime();
        return Math.abs(ms - medianMs) <= windowMs;
      });
    }

    // Deduplicate — merge same person+date entries (handles second shifts returned separately)
    const mergeMap = new Map<string, any>();
    for (const e of filtered) {
      const key = `${e.work_date}::${e.employee_name}`;
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...e });
      } else {
        const existing = mergeMap.get(key);
        // Keep earliest start
        if (e.shift_start && (!existing.shift_start || e.shift_start < existing.shift_start)) {
          existing.shift_start = e.shift_start;
        }
        // Keep latest end
        if (e.shift_end && (!existing.shift_end || e.shift_end > existing.shift_end)) {
          existing.shift_end = e.shift_end;
        }
        // Merge all_shifts strings
        if (e.all_shifts && existing.all_shifts && e.all_shifts !== existing.all_shifts) {
          existing.all_shifts = `${existing.all_shifts} / ${e.all_shifts}`;
        } else if (e.all_shifts && !existing.all_shifts) {
          existing.all_shifts = e.all_shifts;
        }
      }
    }
    const deduped = Array.from(mergeMap.values());

    // Determine which dates this upload covers
    const uploadedDates = [...new Set(deduped.map((e: any) => e.work_date))].sort();

    const supabase = supabaseAdmin();

    // For each date covered by this upload, delete entries for employees
    // who are NOT in the new upload (they've been removed from the schedule)
    for (const date of uploadedDates) {
      const presentEmployees = deduped
        .filter((e: any) => e.work_date === date)
        .map((e: any) => e.employee_name);

      if (presentEmployees.length > 0) {
        // Delete rows for this date where employee is NOT in the new list
        await supabase
          .from("schedule_entries")
          .delete()
          .eq("work_date", date)
          .not("employee_name", "in", `(${presentEmployees.map(n => `"${n}"`).join(",")})`);
      } else {
        // No one is working this date in the new upload — clear it entirely
        await supabase
          .from("schedule_entries")
          .delete()
          .eq("work_date", date);
      }
    }

    // Upsert the new/updated entries
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

    return json({
      ok: true,
      count: deduped.length,
      dates: uploadedDates,
      entries: deduped,
    });

  } catch (e: any) {
    console.error("[schedule-upload] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
