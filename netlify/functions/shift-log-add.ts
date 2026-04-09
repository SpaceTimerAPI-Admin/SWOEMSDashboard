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
    const note = String(body.note || "").trim();
    if (!note) return badRequest("Note is required");

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("shift_log_entries")
      .insert({ employee_id: session.employee.id, note })
      .select("id, note, created_at, employee_id")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, entry: { ...data, employee_name: session.employee.name } });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
