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
        model: "claude-opus-4-5",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `You are reading a SeaWorld weekly work schedule. This is the COMPLETE authoritative schedule for the dates shown.

Your job: Extract EVERY person's working shifts for EVERY date column shown in this schedule.

STEP 1 — Read all column headers carefully. The dates are in the format M/D/YYYY. Extract the YYYY-MM-DD for each column. There may be 7 columns (e.g. Thursday through Wednesday). Read ALL of them even if some employees have no shift that day.

STEP 2 — For each employee row, read left to right across all date columns:
- If the cell has a time range like "6:00 AM - 2:30 PM" → that person is working, include it
- If the cell says "Off", "OFF", "PTO", or is blank → skip it (person is not working)
- Do NOT include location codes like "SWF TECH EMS", "SSFF", "Ad Hoc", "EO" — times only

STEP 3 — SECOND SHIFTS: If a row has NO employee name in the far-left column but has time(s) in day columns, it belongs to the most recently named employee above it. That employee has a second shift on that day. Merge both shifts with " / " e.g. "12:30 PM - 6:00 PM / 11:30 PM - 2:00 AM"

STEP 4 — Return ONLY a JSON array, no markdown, no explanation. Each object:
{
  "employee_name": "First L.",  // Convert "LASTNAME, FIRSTNAME M" → "Firstname L."
  "work_date": "YYYY-MM-DD",   // From the column header
  "shift_start": "6:00 AM",    // Start of first shift, null if unknown
  "shift_end": "2:30 PM",      // End of last shift, null if unknown
  "all_shifts": "6:00 AM - 2:30 PM"  // Full string; use " / " for double shifts
}

IMPORTANT: Include entries for ALL dates in the schedule, even if only a few people work that day. Do not skip any date column.`,
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

    // Deduplicate — merge same person+date entries (handles second shifts returned separately)
    const mergeMap = new Map<string, any>();
    for (const e of valid as any[]) {
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
