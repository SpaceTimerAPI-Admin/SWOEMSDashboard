/**
 * POST /api/beo-action
 * Body: { beo_id, action_type: "setup"|"strike" }
 * Records who completed setup or strike and when.
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
    const action_type = String(body.action_type || "").trim();

    if (!beo_id) return badRequest("beo_id required");
    if (action_type !== "setup" && action_type !== "strike") return badRequest("action_type must be setup or strike");

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("beo_actions")
      .upsert({
        beo_id,
        action_type,
        completed_by: session.employee.id,
        completed_at: new Date().toISOString(),
      }, { onConflict: "beo_id,action_type" });

    if (error) return json({ ok: false, error: error.message }, 500);

    // Log the action
    await supabase.from("beo_log").insert({
      beo_id,
      employee_id: session.employee.id,
      action: action_type,
      note: `${action_type === "setup" ? "Setup" : "Strike"} marked complete by ${session.employee.name}`,
    });

    return json({ ok: true, completed_by: session.employee.name, completed_at: new Date().toISOString() });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
