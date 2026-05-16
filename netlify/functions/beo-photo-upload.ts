/**
 * POST /api/beo-photo-upload
 * Body: { beo_id, image_base64, content_type }
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
    const beo_id = String(body.beo_id || "").trim();
    const image_base64 = String(body.image_base64 || "").trim();
    const content_type = String(body.content_type || "image/jpeg").trim();

    if (!beo_id || !image_base64) return badRequest("beo_id and image_base64 required");

    const supabase = supabaseAdmin();
    const buf = Buffer.from(image_base64, "base64");
    const ext = content_type.split("/")[1] || "jpg";
    const storagePath = `${beo_id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("beo-photos")
      .upload(storagePath, buf, { contentType: content_type, upsert: false });

    if (uploadError) return json({ ok: false, error: uploadError.message }, 500);

    const { data: urlData } = supabase.storage.from("beo-photos").getPublicUrl(storagePath);
    const public_url = urlData?.publicUrl || "";

    const { error: dbError } = await supabase.from("beo_photos").insert({
      beo_id,
      storage_path: storagePath,
      public_url,
      uploaded_by: session.employee.id,
    });

    if (dbError) return json({ ok: false, error: dbError.message }, 500);
    return json({ ok: true, public_url });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
