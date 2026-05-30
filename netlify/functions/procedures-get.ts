import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    const role = (session.employee as any).role || "ems";

    const body = event.body ? JSON.parse(event.body) : {};
    const id = String(body.id || "").trim();
    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();
    const { data: proc, error: procErr } = await supabase
      .from("procedures")
      .select("id, title, category, visibility, step_count, created_at, created_by, employees!procedures_created_by_fkey(name)")
      .eq("id", id)
      .single();

    if (procErr || !proc) return json({ ok: false, error: "Not found" }, 404);

    // Check visibility
    if (role === "show_tech" && proc.visibility !== "everyone")
      return json({ ok: false, error: "Forbidden" }, 403);
    if (role === "ems" && !["ems", "everyone"].includes(proc.visibility))
      return json({ ok: false, error: "Forbidden" }, 403);

    const { data: steps, error: stepsErr } = await supabase
      .from("procedure_steps")
      .select("id, step_number, title, notes, photo_url")
      .eq("procedure_id", id)
      .order("step_number");

    if (stepsErr) return json({ ok: false, error: stepsErr.message }, 500);

    return json({ ok: true, procedure: { ...proc, created_by_name: (proc as any).employees?.name || "Unknown" }, steps: steps || [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
