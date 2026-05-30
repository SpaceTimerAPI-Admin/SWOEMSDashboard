/**
 * POST /api/procedures-save
 * Creates or updates a procedure and all its steps atomically.
 * Body: { id?, title, category, visibility, steps: [{id?, step_number, title, notes, photo_url?, photo_path?}] }
 */
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
    const { title, category, visibility, steps } = body;
    let { id } = body;

    if (!title?.trim()) return badRequest("Title required");
    if (!["A Side", "B Side"].includes(category)) return badRequest("Invalid category");
    if (!["admin", "ems", "everyone"].includes(visibility)) return badRequest("Invalid visibility");
    if (!Array.isArray(steps)) return badRequest("Steps required");

    const supabase = supabaseAdmin();

    if (id) {
      // Update existing
      const { error: updErr } = await supabase
        .from("procedures")
        .update({ title: title.trim(), category, visibility, updated_at: new Date().toISOString(), step_count: steps.length })
        .eq("id", id);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      // Delete old steps and reinsert
      await supabase.from("procedure_steps").delete().eq("procedure_id", id);
    } else {
      // Create new
      const { data: newProc, error: createErr } = await supabase
        .from("procedures")
        .insert({ title: title.trim(), category, visibility, created_by: session.employee.id, step_count: steps.length })
        .select("id").single();
      if (createErr) return json({ ok: false, error: createErr.message }, 500);
      id = newProc.id;
    }

    // Insert steps
    if (steps.length > 0) {
      const rows = steps.map((s: any, i: number) => ({
        procedure_id: id,
        step_number: i + 1,
        title: String(s.title || "").trim(),
        notes: s.notes ? String(s.notes).trim() : null,
        photo_url: s.photo_url || null,
        photo_path: s.photo_path || null,
      }));
      const { error: stepsErr } = await supabase.from("procedure_steps").insert(rows);
      if (stepsErr) return json({ ok: false, error: stepsErr.message }, 500);
    }

    return json({ ok: true, id });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
