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
    const id = String(body.id || "").trim();
    // assigned_to can be null (unassign) or a valid employee UUID
    const assigned_to = body.assigned_to || null;
    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_to })
      .eq("id", id);

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
