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
    const project_id = String(body.project_id || "").trim();
    const storage_path = String(body.storage_path || body.storage_key || body.storageKey || "").trim();

    if (!project_id) return badRequest("project_id required");
    if (!storage_path) return badRequest("storage_path required");

    const supabase = supabaseAdmin();
    const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const public_url = base ? `${base}/storage/v1/object/public/project-photos/${storage_path}` : null;

    const { data, error } = await supabase
      .from("project_photos")
      .insert({
        project_id,
        storage_path,
        public_url,
        uploaded_by: session.employee.id,
      })
      .select("id, project_id, storage_path, public_url, created_at")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, photo: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
