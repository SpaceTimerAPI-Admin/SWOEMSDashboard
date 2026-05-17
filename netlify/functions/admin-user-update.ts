import type { Handler } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const id = String(body.id || "").trim();
    if (!id) return badRequest("id required");

    const updates: any = {};
    if (body.name) updates.name = String(body.name).trim();
    if (body.email) updates.email = String(body.email).trim().toLowerCase();
    if (body.role && ["admin","ems","show_tech"].includes(body.role)) updates.role = body.role;
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if (body.pin) {
      if (!/^\d{4}$/.test(body.pin)) return badRequest("PIN must be 4 digits");
      updates.pin_hash = await bcrypt.hash(body.pin, 10);
    }

    if (Object.keys(updates).length === 0) return badRequest("Nothing to update");

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select("id, employee_id, name, email, role, is_active")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, employee: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
