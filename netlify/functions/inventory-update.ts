import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

const FIELD_LABELS: Record<string, string> = {
  name:          "Name",
  serial_number: "Serial #",
  asset_tag:     "Asset Tag",
  category_name: "Category",
  manufacturer:  "Manufacturer",
  model:         "Model",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const body = event.body ? JSON.parse(event.body) : {};
  const { id, name, serial_number, asset_tag, category_name, manufacturer, model } = body;

  if (!id) return badRequest("id required");

  const supabase = supabaseAdmin();

  // Fetch current item to record old values in audit log
  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("name, serial_number, asset_tag, category_name, manufacturer, model")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return json({ ok: false, error: "Item not found" }, 404);

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
  if (name          !== undefined) patch.name          = name.trim();
  if (serial_number !== undefined) patch.serial_number = serial_number.trim() || null;
  if (asset_tag     !== undefined) patch.asset_tag     = asset_tag.trim() || null;
  if (manufacturer  !== undefined) patch.manufacturer  = manufacturer.trim() || null;
  if (model         !== undefined) patch.model         = model.trim() || null;
  if (category_name !== undefined) patch.category_name = category_name || null;
  if (category_id   !== undefined) patch.category_id   = category_id;

  if (Object.keys(patch).length === 0) return badRequest("nothing to update");

  const { data: item, error } = await supabase
    .from("inventory_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return json({ ok: false, error: error.message }, 500);

  // Build audit log entries for each changed field
  const auditFields = ["name", "serial_number", "asset_tag", "category_name", "manufacturer", "model"] as const;
  const changes: string[] = [];

  for (const field of auditFields) {
    if (patch[field] === undefined) continue;
    const oldVal = (existing as any)[field] ?? "";
    const newVal = patch[field] ?? "";
    if (String(oldVal) !== String(newVal)) {
      const label = FIELD_LABELS[field] || field;
      changes.push(`${label}: "${oldVal || "(blank)"}" → "${newVal || "(blank)"}"`);
    }
  }

  if (changes.length > 0) {
    await supabase.from("inventory_events").insert({
      item_id:           id,
      event_type:        "field_edit",
      performed_by:      (session as any).employee_id || null,
      performed_by_name: (session as any).name || (session as any).email || "Unknown",
      note:              `Fields updated: ${changes.join("; ")}`,
    });
  }

  return json({ ok: true, item });
};
