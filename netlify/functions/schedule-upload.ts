/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Calls Claude vision with streaming (keeps connection alive),
 * parses the schedule JSON, upserts into schedule_entries.
 * Returns { ok: true, count, dates } on success.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  const session = await requireSession(event);
  if (!session) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Unauthorized" }) };
  }

  let body: any = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const image_base64 = String(body.image_base64 || "").trim();
  const content_type = String(body.content_type || "image/jpeg").trim();

  if (!image_base64) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "image_base64 required" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not configured" }) };
  }

  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const isPdf = content_type === "application/pdf";
  const source = isPdf
    ? { type: "base64" as const, media_type: "application/pdf" as const, data: image_base64 }
    : { type: "base64" as const, media_type: content_type as any, data: image_base64 };
  const contentBlock = isPdf ? { type: "document", source } : { type: "image", source };

  // Use streaming so the connection stays alive while Claude processes the image
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
   - Row 3 "OP Hours": PARK OPERATING HOURS — NOT employee shifts. NEVER use these times for any employee.
   - Row 4: event name — ignore

3. SECTIONS: bold dark header rows divide employees into groups:
   "PART TIME"→"ems_part_time", "Full Time"→"ems_full_time", "Show Ops"→"show_ops"

4. Each employee has EXACTLY TWO rows:
   - Row A (times): shift_start and shift_end, or "X" for day off
   - Row B (label): "Opener", "Closer", "SUP", etc. — IGNORE for times

5. For each employee's day cell:
   - Two values: LEFT = shift_start, RIGHT = shift_end
   - If EITHER is "X" → employee is OFF → skip, do NOT output a record
   - If blank → skip that day
   - ONLY use times from that employee's Row A

6. Names: "LASTNAME, FIRSTNAME" → "Firstname L."

7. Notes column → shift_note, or null if blank.

8. Times as printed: "6:00am", "2:30pm". Lowercase am/pm.

Output one JSON object per working shift:
{"employee_name":"Firstname L.","work_date":"YYYY-MM-DD","shift_start":"h:mmam","shift_end":"h:mmpm","all_shifts":"h:mmam–h:mmpm","section":"ems_part_time","shift_note":null}`,
          },
        ],
      }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    console.error("[schedule-upload] Claude API error:", err);
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: `Vision API error: ${claudeRes.status}` }) };
  }

  // Read SSE stream fully — streaming keeps connection alive during processing
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
    } catch { /* skip */ }
  }

  if (!rawText) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Vision API returned empty response." }) };
  }

  // Parse JSON array from response
  let entries: any[] = [];
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
    console.error("[schedule-upload] Parse error. Raw:", rawText.slice(0, 400));
    return { statusCode: 422, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Could not parse schedule. Try a clearer photo." }) };
  }

  // Validate
  const valid = entries.filter(e =>
    e.employee_name && e.work_date && /^\d{4}-\d{2}-\d{2}$/.test(e.work_date)
  );
  if (valid.length === 0) {
    return { statusCode: 422, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "No schedule entries found in the image." }) };
  }

  // Date sanity: keep entries within 30 days of today; if none, use the closest week
  const todayMs = Date.now();
  let filtered = valid.filter(e =>
    Math.abs(new Date(e.work_date + "T12:00:00").getTime() - todayMs) <= 30 * 24 * 60 * 60 * 1000
  );
  if (filtered.length === 0) {
    const allMs = valid.map(e => new Date(e.work_date + "T12:00:00").getTime());
    const closest = allMs.reduce((a, b) => Math.abs(a - todayMs) < Math.abs(b - todayMs) ? a : b);
    filtered = valid.filter(e =>
      Math.abs(new Date(e.work_date + "T12:00:00").getTime() - closest) <= 7 * 24 * 60 * 60 * 1000
    );
  }

  // Dedup: keep the most complete record per person+date
  const mergeMap = new Map<string, any>();
  for (const e of filtered) {
    const key = `${e.work_date}::${e.employee_name}`;
    if (!mergeMap.has(key)) {
      mergeMap.set(key, { ...e });
    } else {
      const existing = mergeMap.get(key);
      if (!existing.shift_start && e.shift_start) mergeMap.set(key, { ...e });
      else {
        if (!existing.section && e.section) existing.section = e.section;
        if (!existing.shift_note && e.shift_note) existing.shift_note = e.shift_note;
      }
    }
  }
  const deduped = Array.from(mergeMap.values());
  const uploadedDates = [...new Set(deduped.map((e: any) => e.work_date as string))].sort();

  const supabase = supabaseAdmin();
  const uploadedBy = session.employee?.id || null;

  // Clear old entries for the same dates, then upsert fresh ones
  for (const date of uploadedDates) {
    await supabase.from("schedule_entries").delete().eq("work_date", date);
  }

  const rows = deduped.map((e: any) => ({
    work_date: e.work_date,
    employee_name: e.employee_name,
    shift_start: e.shift_start || null,
    shift_end: e.shift_end || null,
    all_shifts: e.all_shifts || null,
    section: e.section || null,
    shift_note: e.shift_note || null,
    uploaded_by: uploadedBy,
    uploaded_at: new Date().toISOString(),
  }));

  let { error: upsertError } = await supabase
    .from("schedule_entries")
    .upsert(rows, { onConflict: "work_date,employee_name" });

  // Fallback: drop extended columns if schema doesn't have them yet
  if (upsertError && (upsertError.message.includes("column") || upsertError.message.includes("section") || upsertError.message.includes("shift_note"))) {
    const baseRows = deduped.map((e: any) => ({
      work_date: e.work_date,
      employee_name: e.employee_name,
      shift_start: e.shift_start || null,
      shift_end: e.shift_end || null,
      all_shifts: e.all_shifts || null,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    }));
    const fallback = await supabase.from("schedule_entries").upsert(baseRows, { onConflict: "work_date,employee_name" });
    upsertError = fallback.error;
  }

  if (upsertError) {
    console.error("[schedule-upload] Upsert error:", upsertError.message);
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: upsertError.message }) };
  }

  console.log(`[schedule-upload] Done — ${deduped.length} shifts across ${uploadedDates.length} dates`);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, count: deduped.length, dates: uploadedDates }),
  };
};
