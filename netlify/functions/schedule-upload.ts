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
        max_tokens: 6000,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `Today is ${new Date().toISOString().slice(0, 10)}. The year is ${new Date().getFullYear()}. Extract every working shift from this EMS schedule image into a JSON array. Output ONLY valid JSON starting with [ and ending with ]. No explanation, no markdown.

CRITICAL RULES — read carefully:

1. DATES: Header row "Date" shows values like "5-Nov", "12-Nov". Combine with year ${new Date().getFullYear()} → "2026-11-05". Never use any other year.

2. HEADER ROWS TO IGNORE (they are NOT employee rows):
   - Row labeled "Day" (day names)
   - Row labeled "Date" (date values)
   - Row labeled "OP Hours" (park operating hours — NOT employee shifts)
   - Any row with an event name under OP Hours
   - Section headers: "PART TIME", "Full Time", "Show Ops"

3. EMPLOYEE SECTIONS:
   - "PART TIME" section → section = "ems_part_time"
   - "Full Time" section → section = "ems_full_time"
   - "Show Ops" section → section = "show_ops"

4. EACH EMPLOYEE has EXACTLY TWO rows in the grid:
   - Row A (times row): contains shift start/end times or "X X"
   - Row B (label row): contains text like "Opener", "Closer", "SUP", "Christmas Lead" — IGNORE for times

5. READING EACH DAY'S CELL for an employee:
   - Each day column has TWO time cells side by side: LEFT = shift_start, RIGHT = shift_end
   - If BOTH cells contain "X" → employee is OFF that day → DO NOT output a record for that day
   - If cells contain a time range like "6:00am" and "2:30pm" → that is one shift
   - Only use times from that employee's own row — do NOT borrow times from adjacent employees' rows

6. NAME FORMAT: Names appear as "LASTNAME, FIRSTNAME" in the leftmost column.
   Convert to: "Firstname L." — first name + space + last name initial + period.
   Examples: "MCHugh, Anthony" → "Anthony M.", "Sleeper, Connor" → "Connor S.", "Wang, Lori" → "Lori W."
   For "Show Ops" names that appear as "FIRSTNAME, LASTNAME" or "Firstname Lastname", apply same rule.

7. NOTES COLUMN: Far-right column labeled "Notes" — if text exists for the employee's row, use as shift_note (string). Otherwise null.

8. TIME FORMAT: Use exactly as printed — e.g. "6:00am", "2:30pm", "10:00pm", "12:00am". Keep lowercase am/pm.

Output format — one object per (employee, working day):
{"employee_name":"Firstname L.","work_date":"YYYY-MM-DD","shift_start":"h:mmam","shift_end":"h:mmpm","all_shifts":"h:mmam–h:mmpm","section":"ems_part_time","shift_note":null}`,
              },
            ],
          },
          {
            role: "assistant",
            content: "[",
          },
        ],
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
      // The assistant was prefilled with "[" so the response continues from there.
      // Reconstruct the full array string and parse it.
      const reconstructed = "[" + rawText;
      const cleaned = reconstructed.replace(/```json|```/g, "").trim();
      // Try full parse first, then fall back to regex extraction
      let parsed: any = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }
      if (!Array.isArray(parsed)) throw new Error("Not an array");
      entries = parsed;
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response:", rawText.slice(0, 500));
      return json({ ok: false, error: "Could not parse schedule. Try a clearer photo." }, 422);
    }

    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );

    if (valid.length === 0) {
      return json({ ok: false, error: "No schedule entries found in the upload." }, 422);
    }

    // Sanity check — keep only dates within 30 days of today (removes hallucinated wrong-year dates)
    const todayMs = Date.now();
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    let filtered = valid.filter(e => {
      const ms = new Date(e.work_date + "T12:00:00").getTime();
      return Math.abs(ms - todayMs) <= windowMs;
    });
    // If that wiped everything (AI got all dates wrong), fall back to the closest date cluster
    if (filtered.length === 0) {
      const allMs = valid.map(e => new Date(e.work_date + "T12:00:00").getTime());
      const closest = allMs.reduce((a, b) => Math.abs(a - todayMs) < Math.abs(b - todayMs) ? a : b);
      filtered = valid.filter(e => {
        const ms = new Date(e.work_date + "T12:00:00").getTime();
        return Math.abs(ms - closest) <= 7 * 24 * 60 * 60 * 1000;
      });
    }

    // Deduplicate — keep first occurrence per person+date (Sonnet returns one record per shift;
    // if somehow duplicated, prefer the entry with both start and end populated)
    const mergeMap = new Map<string, any>();
    for (const e of filtered) {
      const key = `${e.work_date}::${e.employee_name}`;
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...e });
      } else {
        const existing = mergeMap.get(key);
        // Only replace if new entry has more complete data (both times vs one)
        const existingComplete = existing.shift_start && existing.shift_end;
        const newComplete = e.shift_start && e.shift_end;
        if (!existingComplete && newComplete) {
          mergeMap.set(key, { ...e });
        } else {
          // Keep non-null section and shift_note
          if (!existing.section && e.section) existing.section = e.section;
          if (!existing.shift_note && e.shift_note) existing.shift_note = e.shift_note;
        }
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
