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
    if (!beo_id) return badRequest("beo_id required");

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("beo_events")
      .update({ deleted_at: null, deleted_reason: null })
      .eq("id", beo_id);

    if (error) return json({ ok: false, error: error.message }, 500);

    // Log the restore
    await supabase.from("beo_log").insert({
      beo_id,
      employee_id: session.employee.id,
      action: "restored",
      note: `Restored by ${session.employee.name}`,
    });

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
