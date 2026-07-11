/**
 * Returns a signed upload URL for a public work order photo.
 * No auth required — uses a temp path that gets linked when the ticket is created.
 * POST /api/public-work-order-photo
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const rawName = String(body.filename || body.file_name || "").trim();
    const content_type = String(body.content_type || "image/jpeg").trim();

    const extFromType = (ct: string) => {
      const v = ct.toLowerCase();
      if (v.includes("png")) return "png";
      if (v.includes("webp")) return "webp";
      if (v.includes("heic") || v.includes("heif")) return "heic";
      return "jpg";
    };

    const file_name = rawName || `photo.${extFromType(content_type)}`;
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = (safeName.split(".").pop() || "").toLowerCase();
    const allowed = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
    if (!allowed.has(ext)) return badRequest("Unsupported file type");

    const supabase = supabaseAdmin();
    const ts = Date.now();
    const storage_path = `public-submissions/${ts}-${safeName}`;

    const { data, error } = await supabase.storage
      .from("ticket-photos")
      .createSignedUploadUrl(storage_path, { upsert: false });

    if (error || !data) return json({ ok: false, error: error?.message || "Failed to create upload URL" }, 500);

    return json({
      ok: true,
      upload_url: data.signedUrl,
      storage_path,
      storage_key: storage_path,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
