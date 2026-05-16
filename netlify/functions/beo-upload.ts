/**
 * POST /api/beo-upload
 * Body: { pdf_base64, filename, event_name?, event_date? }
 *
 * Duplicate/revision detection:
 * 1. Strip "REV X" / "REV2" / revision suffixes from the new event name to get the base name
 * 2. Check if an event exists on the same date with a matching base name
 * 3. If found → update that event's PDF (replace file, update name to new revision)
 *    Preserves setup/strike actions and photos.
 * 4. If not found → create new event
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

/** Strip revision suffixes to get the base event name for matching.
 *  "Gradtastic REV 2" → "gradtastic"
 *  "Gradtastic_REV_2" → "gradtastic"
 *  "Spring Fling v3"  → "spring fling"
 */
function baseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+rev[\s_]*\d+/gi, "")   // " REV 2", "_REV_2"
    .replace(/[\s_]+v\d+$/gi, "")           // " v3", "_v3" at end
    .replace(/[\s_]+revision[\s_]*\d+/gi, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const pdf_base64 = String(body.pdf_base64 || "").trim();
    const filename = String(body.filename || "event.pdf").trim();
    let event_name = String(body.event_name || "").trim();
    let event_date = String(body.event_date || "").trim();

    if (!pdf_base64) return badRequest("pdf_base64 required");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const supabase = supabaseAdmin();

    // Use Claude to extract event name and date from the PDF
    if ((!event_name || !event_date) && apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            messages: [{
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdf_base64 },
                },
                {
                  type: "text",
                  text: `Extract the event name and date from this BEO (Banquet Event Order). Include the full name with any revision number (e.g. "Gradtastic REV 2"). Return ONLY a JSON object:
{"event_name":"Gradtastic REV 2","event_date":"2026-05-22"}

event_date must be YYYY-MM-DD. Return nothing else.`,
                },
              ],
            }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.content?.[0]?.text || "";
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (!event_name && parsed.event_name) event_name = parsed.event_name;
            if (!event_date && parsed.event_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.event_date)) {
              event_date = parsed.event_date;
            }
          }
        }
      } catch (e) {
        console.error("[beo-upload] Claude extraction failed:", e);
      }
    }

    // Fallback
    if (!event_name) event_name = filename.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").trim();
    if (!event_date) event_date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // --- Duplicate / revision detection ---
    // Check for an existing event on the same date whose base name matches
    const { data: existingEvents } = await supabase
      .from("beo_events")
      .select("id, event_name, event_date, pdf_path")
      .eq("event_date", event_date);

    const newBase = baseName(event_name);
    const existing = (existingEvents || []).find(ev => baseName(ev.event_name) === newBase);

    // Upload the new PDF to storage
    const pdfBuffer = Buffer.from(pdf_base64, "base64");
    const storagePath = `${event_date}/${Date.now()}_${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("beo-pdfs")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadError) return json({ ok: false, error: uploadError.message }, 500);

    const { data: urlData } = supabase.storage.from("beo-pdfs").getPublicUrl(storagePath);
    const pdf_url = urlData?.publicUrl || "";

    if (existing) {
      // --- UPDATE existing event (revision / duplicate) ---

      // Delete the old PDF from storage if it exists
      if (existing.pdf_path) {
        await supabase.storage.from("beo-pdfs").remove([existing.pdf_path]).catch(() => {});
      }

      // Update the DB row — new name (revision), new PDF, preserve everything else
      const { data: updated, error: updateError } = await supabase
        .from("beo_events")
        .update({
          event_name,          // Updated to new revision name
          pdf_path: storagePath,
          pdf_url,
          uploaded_by: session.employee.id,
          uploaded_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, event_name, event_date, pdf_url")
        .single();

      if (updateError) return json({ ok: false, error: updateError.message }, 500);

      console.log(`[beo-upload] Updated existing event "${existing.event_name}" → "${event_name}"`);

      return json({
        ok: true,
        event: updated,
        action: "updated",
        previous_name: existing.event_name,
        message: `Updated from "${existing.event_name}" to "${event_name}"`,
      });

    } else {
      // --- CREATE new event ---
      const { data: beoData, error: dbError } = await supabase
        .from("beo_events")
        .insert({
          event_name,
          event_date,
          pdf_path: storagePath,
          pdf_url,
          uploaded_by: session.employee.id,
        })
        .select("id, event_name, event_date, pdf_url")
        .single();

      if (dbError) return json({ ok: false, error: dbError.message }, 500);

      console.log(`[beo-upload] Created new event "${event_name}" on ${event_date}`);

      return json({ ok: true, event: beoData, action: "created" });
    }

  } catch (e: any) {
    console.error("[beo-upload] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
