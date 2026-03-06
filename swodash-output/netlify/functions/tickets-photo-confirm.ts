import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

/**
 * Records a photo (already uploaded to Storage) in the DB.
 * Assumes you created:
 *  - Storage bucket: ticket-photos (public recommended for v1)
 *  - Table: ticket_photos (see SQL in this patch)
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const ticket_id = String(body.ticket_id || "").trim();
    const storage_path = String(body.storage_path || body.storage_key || body.storageKey || "").trim();

    if (!ticket_id) return badRequest("ticket_id required");
    if (!storage_path) return badRequest("storage_path required");

    const supabase = supabaseAdmin();

    // Build a public URL (bucket should be public for v1 simplicity)
    const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const public_url = base ? `${base}/storage/v1/object/public/ticket-photos/${storage_path}` : null;

    const { data, error } = await supabase
      .from("ticket_photos")
      .insert({
        ticket_id,
        storage_path,
        public_url,
        uploaded_by: session.employee.id,
      })
      .select("id, ticket_id, storage_path, public_url, created_at")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, photo: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
