import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const body = event.body ? JSON.parse(event.body) : {};
  const { id, name, serial_number, category_name, manufacturer, model } = body;

  if (!id) return badRequest("id required");

  const supabase = supabaseAdmin();

  // Resolve category id if category_name changed
  let category_id: string | null | undefined = undefined;
  if (category_name !== undefined) {
    if (category_name) {
      const { data: cat } = await supabase
        .from("inventory_categories")
        .select("id")
        .eq("name", category_name)
        .maybeSingle();
      category_id = cat?.id || null;
    } else {
      category_id = null;
    }
  }

  const patch: Record<string, any> = {};
  if (name           !== undefined) patch.name           = name.trim();
  if (serial_number  !== undefined) patch.serial_number  = serial_number.trim() || null;
  if (manufacturer   !== undefined) patch.manufacturer   = manufacturer.trim() || null;
  if (model          !== undefined) patch.model          = model.trim() || null;
  if (category_name  !== undefined) patch.category_name  = category_name || null;
  if (category_id    !== undefined) patch.category_id    = category_id;

  if (Object.keys(patch).length === 0) return badRequest("nothing to update");

  const { data: item, error } = await supabase
    .from("inventory_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, item });
};
