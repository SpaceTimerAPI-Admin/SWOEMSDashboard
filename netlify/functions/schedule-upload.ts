/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Accepts image (jpeg/png) or PDF.
 * Reads the new EMS schedule format:
 *   - Header rows: Day / Date / OP Hours (two op windows per day) / event name
 *   - Section headers: "PART TIME", "Full Time", "Show Ops"
 *   - Each employee has TWO rows: times row + label row (Opener, Closer, SUP, etc.)
 *   - Notes column on the far right
 * Upserts entries and removes employees NOT in the upload for covered dates.
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
  section: "ems_part_time" | "ems_full_time" | "show_ops" | null;
  shift_note: string | null;
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
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `You are reading a SeaWorld EMS weekly work schedule image. Read it very carefully and precisely.

THE SCHEDULE LAYOUT:
- Top header: Day names (e.g. Thurs, Friday, Saturday…), then dates, then OP Hours (two time windows per day), then event name (HOSO, HOSO Strike, etc.)
- The schedule is divided into SECTIONS separated by dark/shaded rows:
    • "PART TIME" section  → section = "ems_part_time"
    • "Full Time" section  → section = "ems_full_time"  
    • "Show Ops" section   → section = "show_ops"
- Each employee has TWO consecutive rows:
    • ROW 1 (name row): Employee name in far-left column. Each day column has TWO cells showing shift times (start | end), OR "X X" meaning OFF.
    • ROW 2 (label row): No name in far-left column. Each day shows a role/project label: Opener, Closer, SUP, HOSO Project, Purchasing, Christmas Project, Christmas Install, etc. These labels go in the shift_label field and are NOT part of the shift times.
- "X" or "X X" in a day cell = OFF (no shift for that day). Skip those days.
- The FAR RIGHT column is "Notes" — a single note per employee for the whole week. Examples: "HOSO Closer", "Project Support after Closing", "Show op after opening", "Supporting Install/Strike".

PHASE 1 — MAP THE DATE COLUMNS:
Read each column's date from the header (Day + Date rows). Write them out:
Col 1: Thursday 2026-10-29
Col 2: Friday 2026-10-30
… etc.

PHASE 2 — IDENTIFY SECTIONS:
Note which employees are under each section header (PART TIME / Full Time / Show Ops).

PHASE 3 — EXTRACT EACH EMPLOYEE'S SHIFTS:
For each employee:
- Note their section
- Note their Notes column value (null if blank)
- For each day: if they have times (not X/OFF/blank), record start and end time

IMPORTANT time reading rules:
- Times appear as two cells per day: left cell = start, right cell = end
- Read times exactly: "6:00am", "2:30pm", "1:00am", "10:30am", "5:00PM", "12:00 AM" etc.
- End time "1:00am" or "2:00am" etc. means the shift runs past midnight — keep it as written
- If someone has TWO shifts in a day (split shift), join as "6:00am - 2:30pm / 5:00pm - 2:00am"

PHASE 4 — OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown fences. No explanation text. Each object:
{
  "employee_name": "Firstname L.",
  "work_date": "YYYY-MM-DD",
  "shift_start": "H:MMam",
  "shift_end": "H:MMpm",
  "all_shifts": "H:MMam - H:MMpm",
  "section": "ems_part_time" | "ems_full_time" | "show_ops",
  "shift_note": "text from Notes column or null"
}

Name format: convert "LASTNAME, FIRSTNAME" → "Firstname L." (first name + last initial + period).
Skip any day where the cell shows X, OFF, or is blank.
One JSON object per (employee, work_date) pair.`,
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

    if (responseText.trim().startsWith("<") || responseText.includes("Inactivity Timeout")) {
      console.error("[schedule-upload] Gateway timeout or HTML error returned");
      return json({ ok: false, error: "The request timed out. Try uploading a photo of the schedule instead of a PDF, or crop the image closer to the schedule." }, 504);
    }

    let claudeData: any;
    try {
      claudeData = JSON.parse(responseText);
    } catch {
      console.error("[schedule-upload] Failed to parse Claude API response as JSON. First 500 chars:", responseText.slice(0, 500));
      return json({ ok: false, error: "Vision API returned an unexpected response. Try again." }, 500);
    }
    const rawText = claudeData?.content?.[0]?.text || "";

    let entries: ScheduleEntry[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found");
      entries = JSON.parse(match[0]);
      if (!Array.isArray(entries)) throw new Error("Not an array");
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response:", rawText);
      return json({ ok: false, error: "Could not parse schedule. Try a clearer photo." }, 422);
    }

    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );

    if (valid.length === 0) {
      return json({ ok: false, error: "No schedule entries found in the upload." }, 422);
    }

    // Sanity check — filter to densest 7-day window if dates span more than 14 days
    const dateCounts = new Map<string, number>();
    for (const e of valid) {
      dateCounts.set(e.work_date, (dateCounts.get(e.work_date) || 0) + 1);
    }
    const allMs = [...dateCounts.keys()].map(d => new Date(d + "T12:00:00").getTime());
    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const spanDays = (maxMs - minMs) / 86400000;
    let filtered = valid;
    if (spanDays > 14) {
      const medianMs = allMs.sort((a, b) => a - b)[Math.floor(allMs.length / 2)];
      const windowMs = 7 * 86400000;
      filtered = valid.filter(e => {
        const ms = new Date(e.work_date + "T12:00:00").getTime();
        return Math.abs(ms - medianMs) <= windowMs;
      });
    }

    // Deduplicate — merge same person+date (handles split shifts returned separately)
    const mergeMap = new Map<string, any>();
    for (const e of filtered) {
      const key = `${e.work_date}::${e.employee_name}`;
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...e });
      } else {
        const existing = mergeMap.get(key);
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
        // Keep non-null section and shift_note
        if (!existing.section && e.section) existing.section = e.section;
        if (!existing.shift_note && e.shift_note) existing.shift_note = e.shift_note;
      }
    }
    const deduped = Array.from(mergeMap.values());

    const uploadedDates = [...new Set(deduped.map((e: any) => e.work_date))].sort();

    const supabase = supabaseAdmin();

    // For each covered date, remove employees NOT in this upload
    for (const date of uploadedDates) {
      const presentEmployees = deduped
        .filter((e: any) => e.work_date === date)
        .map((e: any) => e.employee_name);

      if (presentEmployees.length > 0) {
        await supabase
          .from("schedule_entries")
          .delete()
          .eq("work_date", date)
          .not("employee_name", "in", `(${presentEmployees.map(n => `"${n}"`).join(",")})`);
      } else {
        await supabase.from("schedule_entries").delete().eq("work_date", date);
      }
    }

    // Upsert new entries — try with new columns first, fall back if migration not yet run
    const baseRow = (e: any) => ({
      work_date: e.work_date,
      employee_name: e.employee_name,
      shift_start: e.shift_start || null,
      shift_end: e.shift_end || null,
      all_shifts: e.all_shifts || null,
      uploaded_by: session.employee.id,
      uploaded_at: new Date().toISOString(),
    });

    const fullRows = deduped.map((e: any) => ({
      ...baseRow(e),
      section: e.section || null,
      shift_note: e.shift_note || null,
    }));

    let { error: upsertError } = await supabase
      .from("schedule_entries")
      .upsert(fullRows, { onConflict: "work_date,employee_name" });

    // If it failed because section/shift_note columns don't exist yet, retry without them
    if (upsertError && (upsertError.message.includes("section") || upsertError.message.includes("shift_note") || upsertError.message.includes("column"))) {
      console.warn("[schedule-upload] Falling back to upsert without section/shift_note columns:", upsertError.message);
      const fallbackRows = deduped.map(baseRow);
      const fallback = await supabase
        .from("schedule_entries")
        .upsert(fallbackRows, { onConflict: "work_date,employee_name" });
      upsertError = fallback.error;
    }

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
