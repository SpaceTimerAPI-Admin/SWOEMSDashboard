import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

/**
 * Returns a signed upload URL for a ticket photo.
 * Client uploads the file directly to Supabase Storage using the signed URL,
 * then calls tickets-photo-confirm to record it in the DB.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const ticket_id = String(body.ticket_id || "").trim();
    const file_name = String(body.file_name || "").trim();
    const content_type = String(body.content_type || "").trim();

    if (!ticket_id) return badRequest("ticket_id required");
    if (!file_name) return badRequest("file_name required");

    // Basic extension sanitization
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = (safeName.split(".").pop() || "").toLowerCase();
    const allowed = new Set(["jpg","jpeg","png","webp","heic"]);
    if (!allowed.has(ext)) return badRequest("Unsupported file type");

    const supabase = supabaseAdmin();
    const ts = Date.now();
    const storage_path = `${ticket_id}/${ts}-${safeName}`;

    const { data, error } = await supabase.storage
      .from("ticket-photos")
      .createSignedUploadUrl(storage_path, 60);

    if (error || !data) return json({ ok: false, error: error?.message || "Failed to create upload url" }, 500);

    return json({
      ok: true,
      storage_path,
      signed_url: data.signedUrl,
      token: data.token,
      // Helpful for the client
      content_type: content_type || "application/octet-stream",
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
