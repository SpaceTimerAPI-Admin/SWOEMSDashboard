/**
 * POST /api/beo-delete
 * Body: { beo_id, reason }
 * Soft-deletes the event, logs the reason, deletes PDF from storage.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const VALID_REASONS = ["Event Cancelled", "No EMS Involvement", "Dupe/Data Error"];

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const beo_id = String(body.beo_id || "").trim();
    const reason = String(body.reason || "").trim();

    if (!beo_id) return badRequest("beo_id required");
    if (!VALID_REASONS.includes(reason)) return badRequest("Invalid reason");

    const supabase = supabaseAdmin();

    // Get the event first to delete the PDF
    const { data: ev, error: fetchErr } = await supabase
      .from("beo_events")
      .select("id, event_name, pdf_path")
      .eq("id", beo_id)
      .single();

    if (fetchErr || !ev) return json({ ok: false, error: "Event not found" }, 404);

    // Delete PDF from storage
    if (ev.pdf_path) {
      await supabase.storage.from("beo-pdfs").remove([ev.pdf_path]).catch(() => {});
    }

    // Soft-delete: mark as deleted, clear PDF
    const { error: updateErr } = await supabase
      .from("beo_events")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_reason: reason,
        pdf_path: null,
        pdf_url: null,
      })
      .eq("id", beo_id);

    if (updateErr) return json({ ok: false, error: updateErr.message }, 500);

    // Log it
    await supabase.from("beo_log").insert({
      beo_id,
      employee_id: session.employee.id,
      action: "deleted",
      note: `Deleted by ${session.employee.name} — Reason: ${reason}`,
    });

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
