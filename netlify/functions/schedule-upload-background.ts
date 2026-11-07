/**
 * POST /api/schedule-upload-background
 *
 * Netlify Background Function — Netlify responds with 202 immediately,
 * then this handler keeps running (up to 15 min) in the background.
 *
 * Body: { image_base64, content_type, uploaded_by? }
 *
 * Flow:
 *  1. Creates a job row (status=pending) in schedule_upload_jobs
 *  2. Returns the job_id to the caller via a synchronous Supabase insert
 *     — but Netlify has already sent 202 to the browser by this point
 *  ... wait, background functions can't return data.
 *
 * ACTUAL FLOW:
 *  The *caller* (schedule-upload.ts) creates the job row and fires this
 *  endpoint without waiting. This function just does the AI work and
 *  updates the job row when done.
 *
 * Body must include job_id (created by schedule-upload.ts).
 */
import type { BackgroundHandler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";

interface ScheduleEntry {
  employee_name: string;
  work_date: string;
  shift_start: string | null;
  shift_end: string | null;
  all_shifts: string | null;
  section: "ems_part_time" | "ems_full_time" | "show_ops" | null;
  shift_note: string | null;
}

export const handler: BackgroundHandler = async (event) => {
  const supabase = supabaseAdmin();

  let body: any = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const job_id = String(body.job_id || "").trim();
  const image_base64 = String(body.image_base64 || "").trim();
  const content_type = String(body.content_type || "image/jpeg").trim();
  const uploaded_by = body.uploaded_by || null;

  if (!job_id || !image_base64) {
    console.error("[schedule-upload-bg] Missing job_id or image_base64");
    return;
  }

  async function setJobError(msg: string) {
    await supabase
      .from("schedule_upload_jobs")
      .update({ status: "error", error: msg, updated_at: new Date().toISOString() })
      .eq("id", job_id);
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { await setJobError("ANTHROPIC_API_KEY not configured"); return; }

    const year = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);

    const isPdf = content_type === "application/pdf";
    const source = isPdf
      ? { type: "base64" as const, media_type: "application/pdf" as const, data: image_base64 }
      : { type: "base64" as const, media_type: content_type as any, data: image_base64 };
    const contentBlock = isPdf ? { type: "document", source } : { type: "image", source };

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        stream: true,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Today is ${today}. Year: ${year}. Extract every working shift from this EMS schedule image into a JSON array. Output ONLY valid JSON — no markdown, no explanation.

RULES:
1. DATES: Header row "Date" has values like "5-Nov". Combine with ${year} → "${year}-11-05". Never use another year.

2. THE FIRST 4 ROWS ARE HEADERS — NEVER treat them as employee data:
   - Row 1 "Day": day names (Thurs, Friday, etc.)
   - Row 2 "Date": date values (5-Nov, 6-Nov, etc.)
   - Row 3 "OP Hours": TWO times per column (e.g. "10:00 AM" and "6:00 PM") — these are PARK OPERATING HOURS, NOT employee shifts. NEVER use these times for any employee.
   - Row 4: event name (e.g. "Christmas Celebration", "normal operation") — ignore

3. SECTIONS: bold dark header rows divide employees into groups:
   "PART TIME"→"ems_part_time", "Full Time"→"ems_full_time", "Show Ops"→"show_ops"

4. Each employee has EXACTLY TWO rows:
   - Row A (times): shift_start and shift_end, or "X" and "X" for day off
   - Row B (label): "Opener", "Closer", "SUP", "Christmas Lead", etc. — IGNORE this row for times

5. For each employee's day cell:
   - Two values side by side: LEFT = shift_start, RIGHT = shift_end
   - If EITHER value is "X" → employee is OFF → skip entirely, do NOT output a record
   - If the cell is blank or empty → skip that day
   - ONLY use times that appear in that specific employee's Row A — never borrow from headers or other employees

6. Names: "LASTNAME, FIRSTNAME" → "Firstname L." (e.g. "MCHugh, Anthony"→"Anthony M.", "Sleeper, Connor"→"Connor S.", "Cartelli, Aiden"→"Aiden C.", "Laing, Tayton"→"Tayton L.")

7. Notes column (far right, labeled "Notes") → shift_note string, or null if blank.

8. Times exactly as printed in the employee row: "6:00am", "2:30pm", "10:00pm", "12:00am". Lowercase am/pm.

Output one JSON object per (employee, working day):
{"employee_name":"Firstname L.","work_date":"YYYY-MM-DD","shift_start":"h:mmam","shift_end":"h:mmpm","all_shifts":"h:mmam–h:mmpm","section":"ems_part_time","shift_note":null}`,
            },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[schedule-upload-bg] Claude API error:", err);
      await setJobError(`Vision API error: ${claudeRes.status}`);
      return;
    }

    // Consume SSE stream — background function, no timeout risk
    let rawText = "";
    const streamText = await claudeRes.text();
    for (const line of streamText.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          rawText += evt.delta.text;
        }
      } catch { /* skip malformed lines */ }
    }

    if (!rawText) { await setJobError("Vision API returned empty response."); return; }

    // Parse JSON array
    let entries: ScheduleEntry[] = [];
    try {
      let cleaned = rawText.replace(/```json|```/g, "").trim();
      if (!cleaned.startsWith("[")) cleaned = "[" + cleaned;
      if (!cleaned.endsWith("]")) {
        const lastBrace = cleaned.lastIndexOf("}");
        cleaned = lastBrace !== -1 ? cleaned.slice(0, lastBrace + 1) + "]" : cleaned + "]";
      }
      let parsed: any = null;
      try { parsed = JSON.parse(cleaned); } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }
      if (!Array.isArray(parsed)) throw new Error("Not an array");
      entries = parsed;
    } catch {
      console.error("[schedule-upload-bg] JSON parse error. Raw:", rawText.slice(0, 600));
      await setJobError("Could not parse schedule response. Try a clearer photo.");
      return;
    }

    const valid = entries.filter(e =>
      e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
    );
    if (valid.length === 0) { await setJobError("No valid schedule entries found."); return; }

    // Date sanity filter
    const todayMs = Date.now();
    const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;
    let filtered = valid.filter(e =>
      Math.abs(new Date(e.work_date + "T12:00:00").getTime() - todayMs) <= thirtyDayMs
    );
    if (filtered.length === 0) {
      const allMs = valid.map(e => new Date(e.work_date + "T12:00:00").getTime());
      const closest = allMs.reduce((a, b) => Math.abs(a - todayMs) < Math.abs(b - todayMs) ? a : b);
      filtered = valid.filter(e =>
        Math.abs(new Date(e.work_date + "T12:00:00").getTime() - closest) <= 7 * 24 * 60 * 60 * 1000
      );
    }

    // Dedup
    const mergeMap = new Map<string, any>();
    for (const e of filtered) {
      const key = `${e.work_date}::${e.employee_name}`;
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...e });
      } else {
        const existing = mergeMap.get(key);
        const existingComplete = existing.shift_start && existing.shift_end;
        const newComplete = e.shift_start && e.shift_end;
        if (!existingComplete && newComplete) mergeMap.set(key, { ...e });
        else {
          if (!existing.section && e.section) existing.section = e.section;
          if (!existing.shift_note && e.shift_note) existing.shift_note = e.shift_note;
        }
      }
    }
    const deduped = Array.from(mergeMap.values());
    const uploadedDates = [...new Set(deduped.map((e: any) => e.work_date))].sort();

    // Clear old entries then upsert
    for (const date of uploadedDates) {
      const presentEmployees = deduped.filter((e: any) => e.work_date === date).map((e: any) => e.employee_name);
      if (presentEmployees.length > 0) {
        await supabase.from("schedule_entries").delete()
          .eq("work_date", date)
          .not("employee_name", "in", `(${presentEmployees.map((n: string) => `"${n}"`).join(",")})`);
      } else {
        await supabase.from("schedule_entries").delete().eq("work_date", date);
      }
    }

    const baseRow = (e: any) => ({
      work_date: e.work_date,
      employee_name: e.employee_name,
      shift_start: e.shift_start || null,
      shift_end: e.shift_end || null,
      all_shifts: e.all_shifts || null,
      uploaded_by,
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

    if (upsertError && (upsertError.message.includes("section") || upsertError.message.includes("shift_note") || upsertError.message.includes("column"))) {
      const fallback = await supabase.from("schedule_entries").upsert(deduped.map(baseRow), { onConflict: "work_date,employee_name" });
      upsertError = fallback.error;
    }

    if (upsertError) { await setJobError(upsertError.message); return; }

    // Mark done
    await supabase.from("schedule_upload_jobs").update({
      status: "done",
      result: { ok: true, count: deduped.length, dates: uploadedDates },
      updated_at: new Date().toISOString(),
    }).eq("id", job_id);

    console.log(`[schedule-upload-bg] Done — ${deduped.length} shifts across ${uploadedDates.length} dates`);
  } catch (e: any) {
    console.error("[schedule-upload-bg] Error:", e?.message);
    await setJobError(e?.message || "Server error");
  }
};
