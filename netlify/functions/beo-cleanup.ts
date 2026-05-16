/**
 * Netlify Scheduled Function — runs daily at 4 AM Eastern.
 * Deletes BEO PDFs (and their DB rows) for events that ended 2+ days ago.
 * Photos are kept — only the PDF is deleted.
 *
 * Cron: "0 8 * * *" UTC = 4 AM ET (EDT) / 3 AM ET (EST)
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";

const TZ = "America/New_York";

export const handler: Handler = async () => {
  try {
    const supabase = supabaseAdmin();

    // Cutoff = today ET minus 2 days
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const cutoff = new Date(today + "T00:00:00");
    cutoff.setDate(cutoff.getDate() - 2);
    const cutoffStr = cutoff.toLocaleDateString("en-CA");

    console.log(`[beo-cleanup] Cleaning up events before ${cutoffStr}`);

    // Find events older than cutoff that still have a PDF
    const { data: oldEvents, error: fetchErr } = await supabase
      .from("beo_events")
      .select("id, event_name, event_date, pdf_path")
      .lt("event_date", cutoffStr)
      .not("pdf_path", "is", null);

    if (fetchErr) {
      console.error("[beo-cleanup] Fetch error:", fetchErr.message);
      return { statusCode: 500, body: fetchErr.message };
    }

    if (!oldEvents || oldEvents.length === 0) {
      console.log("[beo-cleanup] No PDFs to clean up");
      return { statusCode: 200, body: "Nothing to clean up" };
    }

    console.log(`[beo-cleanup] Found ${oldEvents.length} event(s) to clean`);

    let deleted = 0;
    let errors = 0;

    for (const ev of oldEvents) {
      try {
        // Delete PDF from Supabase storage
        const { error: storageErr } = await supabase.storage
          .from("beo-pdfs")
          .remove([ev.pdf_path]);

        if (storageErr) {
          console.error(`[beo-cleanup] Storage delete failed for ${ev.event_name}:`, storageErr.message);
          errors++;
          continue;
        }

        // Clear pdf_path and pdf_url from DB row (keep the event record and photos)
        const { error: dbErr } = await supabase
          .from("beo_events")
          .update({ pdf_path: null, pdf_url: null })
          .eq("id", ev.id);

        if (dbErr) {
          console.error(`[beo-cleanup] DB update failed for ${ev.event_name}:`, dbErr.message);
          errors++;
          continue;
        }

        console.log(`[beo-cleanup] Deleted PDF for: ${ev.event_name} (${ev.event_date})`);
        deleted++;
      } catch (e: any) {
        console.error(`[beo-cleanup] Unexpected error for ${ev.event_name}:`, e?.message);
        errors++;
      }
    }

    const msg = `Cleaned up ${deleted} PDF(s), ${errors} error(s)`;
    console.log(`[beo-cleanup] Done — ${msg}`);
    return { statusCode: 200, body: msg };
  } catch (e: any) {
    console.error("[beo-cleanup] Fatal error:", e?.message);
    return { statusCode: 500, body: e?.message || "Error" };
  }
};
