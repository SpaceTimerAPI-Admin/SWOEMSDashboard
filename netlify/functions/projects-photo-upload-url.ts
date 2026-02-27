import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

/**
 * Returns a signed upload URL for a project photo.
 *
 * Client uploads the file directly to Supabase Storage using the signed URL (PUT),
 * then calls projects-photo-confirm to record it in the DB.
 *
 * Accepts either `file_name` (old) or `filename` (new) from the client.
 * If no filename is provided (some mobile capture flows), a safe default is generated.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const project_id = String(body.project_id || body.id || "").trim();
    const rawName = String(body.file_name || body.filename || "").trim();
    const content_type = String(body.content_type || "").trim();

    if (!project_id) return badRequest("project_id required");

    const extFromType = (ct: string) => {
      const v = (ct || "").toLowerCase();
      if (v.includes("png")) return "png";
      if (v.includes("webp")) return "webp";
      if (v.includes("heic") || v.includes("heif")) return "heic";
      if (v.includes("jpeg") || v.includes("jpg")) return "jpg";
      return "jpg";
    };

    const file_name = rawName || `photo.${extFromType(content_type)}`;

    const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = (safeName.split(".").pop() || "").toLowerCase();
    const allowed = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
    if (!allowed.has(ext)) return badRequest("Unsupported file type");

    const supabase = supabaseAdmin();
    const ts = Date.now();
    const storage_path = `${project_id}/${ts}-${safeName}`;

    const { data, error } = await supabase.storage
      .from("project-photos")
      .createSignedUploadUrl(storage_path, { upsert: false });

    if (error || !data) return json({ ok: false, error: error?.message || "Failed to create upload url" }, 500);

    return json({
      ok: true,
      upload_url: data.signedUrl,
      storage_key: storage_path,
      storage_path,
      signed_url: data.signedUrl,
      token: data.token,
      content_type: content_type || "application/octet-stream",
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
