import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    const role = (session.employee as any).role || "ems";
    if (role === "show_tech") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const image_base64 = String(body.image_base64 || "").trim();
    const content_type = String(body.content_type || "image/jpeg").trim();
    if (!image_base64) return badRequest("image_base64 required");

    const supabase = supabaseAdmin();
    const ext = content_type.split("/")[1] || "jpg";
    const path = `steps/${Date.now()}.${ext}`;
    const buf = Buffer.from(image_base64, "base64");

    const { error } = await supabase.storage
      .from("procedure-photos")
      .upload(path, buf, { contentType: content_type, upsert: false });

    if (error) return json({ ok: false, error: error.message }, 500);

    const { data: urlData } = supabase.storage.from("procedure-photos").getPublicUrl(path);
    return json({ ok: true, photo_url: urlData?.publicUrl || "", photo_path: path });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
