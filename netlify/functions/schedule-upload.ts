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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `Today is ${new Date().toISOString().slice(0, 10)}. Year: ${new Date().getFullYear()}. Extract every working shift from this EMS schedule image into a JSON array. Output ONLY valid JSON — no markdown, no explanation.

RULES:
1. DATES: Header row "Date" has values like "5-Nov". Combine with ${new Date().getFullYear()} → "2026-11-05". Never use another year.
2. IGNORE these rows: Day names, Date row, OP Hours row (park operating hours, NOT shifts), event name row, section headers (PART TIME / Full Time / Show Ops).
3. SECTIONS: "PART TIME"→"ems_part_time", "Full Time"→"ems_full_time", "Show Ops"→"show_ops"
4. Each employee has TWO rows: row 1=shift times, row 2=role label (Opener/Closer/SUP etc). Only read row 1.
5. Each day cell has TWO values side by side: LEFT=shift_start, RIGHT=shift_end. If BOTH are "X" → day off, skip. Never use times from another employee's row.
6. Names: "LASTNAME, FIRSTNAME" → "Firstname L." (e.g. "MCHugh, Anthony"→"Anthony M.", "Sleeper, Connor"→"Connor S.")
7. Notes column (far right) → shift_note, or null.
8. Times exactly as printed: "6:00am", "2:30pm", "10:00pm", "12:00am"

One JSON object per working day per employee:
{"employee_name":"Firstname L.","work_date":"YYYY-MM-DD","shift_start":"h:mmam","shift_end":"h:mmpm","all_shifts":"h:mmam–h:mmpm","section":"ems_part_time","shift_note":null}`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[schedule-upload] Claude API error:", err);
      return json({ ok: false, error: `Vision API error: ${claudeRes.status}` }, 500);
    }

    // Consume SSE stream — collect all text_delta events into rawText
    let rawText = "";
    try {
      const streamText = await claudeRes.text();
      if (streamText.trim().startsWith("<") || streamText.includes("Inactivity Timeout")) {
        console.error("[schedule-upload] Gateway timeout returned");
        return json({ ok: false, error: "The request timed out. Try a clearer or closer-cropped photo." }, 504);
      }
      // Parse SSE lines
      const lines = streamText.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            rawText += evt.delta.text;
          }
        } catch { /* skip malformed SSE lines */ }
      }
    } catch (streamErr: any) {
      console.error("[schedule-upload] Stream read error:", streamErr?.message);
      return json({ ok: false, error: "Stream read failed. Try again." }, 500);
    }

    if (!rawText) {
      console.error("[schedule-upload] Empty response from Claude");
      return json({ ok: false, error: "Vision API returned an empty response. Try again." }, 500);
    }

    let entries: ScheduleEntry[] = [];
    try {
      // Strip any markdown fences
      let cleaned = rawText.replace(/```json|```/g, "").trim();

      // With streaming + assistant prefill "[", the prefill character is NOT included
      // in text_delta events — so rawText continues from after "[".
      // Prepend "[" only if rawText doesn't already start with "[".
      if (!cleaned.startsWith("[")) {
        cleaned = "[" + cleaned;
      }

      // Ensure it ends with "]" (truncation guard)
      if (!cleaned.endsWith("]")) {
        // Find last complete object and close the array
        const lastBrace = cleaned.lastIndexOf("}");
        if (lastBrace !== -1) cleaned = cleaned.slice(0, lastBrace + 1) + "]";
        else cleaned = cleaned + "]";
      }

      console.log("[schedule-upload] Attempting parse, first 300 chars:", cleaned.slice(0, 300));

      let parsed: any = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Last resort: regex extract the array
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }
      if (!Array.isArray(parsed)) throw new Error("Not an array");
      entries = parsed;
    } catch {
      console.error("[schedule-upload] Failed to parse Claude response, raw:", rawText.slice(0, 600));
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
