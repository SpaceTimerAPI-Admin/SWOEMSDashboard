/**
 * POST /api/beo-upload
 * Body: { pdf_base64, filename, event_name?, event_date? }
 * Uploads PDF to storage, extracts event name/date via Claude, saves to DB.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const pdf_base64 = String(body.pdf_base64 || "").trim();
    const filename = String(body.filename || "event.pdf").trim();
    // Allow manual override, otherwise Claude will detect
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
                  text: `Extract the event name and date from this BEO (Banquet Event Order). Return ONLY a JSON object like:
{"event_name":"Gradtastic REV 2","event_date":"2026-05-22"}

The event_date must be in YYYY-MM-DD format. The event_name should be exactly as shown in the document title. Return nothing else.`,
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

    // Fallback to filename if extraction failed
    if (!event_name) event_name = filename.replace(/\.pdf$/i, "").replace(/_/g, " ");
    if (!event_date) event_date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Upload PDF to Supabase storage
    const pdfBuffer = Buffer.from(pdf_base64, "base64");
    const storagePath = `${event_date}/${Date.now()}_${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("beo-pdfs")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadError) return json({ ok: false, error: uploadError.message }, 500);

    const { data: urlData } = supabase.storage.from("beo-pdfs").getPublicUrl(storagePath);
    const pdf_url = urlData?.publicUrl || "";

    // Save to DB
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

    return json({ ok: true, event: beoData });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
