/**
 * POST /api/inventory-event
 * Logs an event and updates item status.
 * Supports create_if_missing for inline creation from ticket close.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();
  const emp = (session as any).employee as any;

  const body = event.body ? JSON.parse(event.body) : {};
  const {
    item_id, event_type, location, taken_by, condition,
    vendor, linked_ticket_id, note,
    create_if_missing, new_item_serial, new_item_name, new_item_model, new_item_manufacturer,
  } = body;

  if (!event_type) return badRequest("event_type required");

  const supabase = supabaseAdmin();

  // Resolve or create item
  let resolvedItemId = item_id || null;

  if (!resolvedItemId && create_if_missing && new_item_serial) {
    const assetTag = String(new_item_serial).trim();
    const { data: existing } = await supabase.from("inventory_items").select("id").eq("asset_tag", assetTag).maybeSingle();
    if (existing) {
      resolvedItemId = existing.id;
    } else {
      const { data: newItem, error: createErr } = await supabase.from("inventory_items").insert({
        asset_tag: assetTag,
        serial_number: assetTag,
        name: (new_item_name || "Unknown Item").trim(),
        manufacturer: new_item_manufacturer?.trim() || null,
        model: new_item_model?.trim() || null,
        category_name: "Lighting",
        status: "in_storage",
        location: location || "Shop",
        notes: `Created from work order close`,
      }).select("id").single();
      if (createErr || !newItem) return json({ ok: false, error: "Failed to create inventory item: " + createErr?.message }, 500);
      resolvedItemId = newItem.id;
    }
  }

  if (!resolvedItemId) return badRequest("item_id required");

  const { data: item, error: fetchErr } = await supabase.from("inventory_items").select("*").eq("id", resolvedItemId).single();
  if (fetchErr || !item) return json({ ok: false, error: "Item not found" }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, any> = {};

  switch (event_type) {
    case "checked_out":
      updates.status = "checked_out";
      updates.checked_out_to = emp.id;
      updates.checked_out_to_name = taken_by || emp.name;
      updates.checked_out_at = now;
      updates.location = location || item.location;
      break;
    case "checked_in":
      updates.status = "in_storage";
      updates.checked_out_to = null; updates.checked_out_to_name = null; updates.checked_out_at = null;
      updates.location = location || "Shop";
      break;
    case "deployed":
      updates.status = "deployed";
      updates.deployed_to = location || "";
      updates.deployed_by = emp.id; updates.deployed_by_name = emp.name; updates.deployed_at = now;
      updates.location = location || item.location;
      updates.checked_out_to = null; updates.checked_out_to_name = null; updates.checked_out_at = null;
      break;
    case "pulled":
      updates.status = "in_storage";
      updates.deployed_to = null; updates.deployed_by = null; updates.deployed_by_name = null; updates.deployed_at = null;
      updates.location = location || "Shop";
      break;
    case "sent_to_repair":
      updates.status = "in_repair";
      updates.location = vendor ? `Repair: ${vendor}` : "In Repair";
      updates.checked_out_to = null; updates.checked_out_to_name = null; updates.checked_out_at = null;
      break;
    case "returned_from_repair":
      updates.status = "in_storage";
      updates.location = "Shop";
      break;
    case "retired":
      updates.status = "retired";
      updates.location = location || "Retired";
      break;
    case "note":
      // Update location if provided with a note
      if (location) updates.location = location;
      break;
    default: return badRequest(`Unknown event_type: ${event_type}`);
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase.from("inventory_items").update(updates).eq("id", resolvedItemId);
    if (updateErr) return json({ ok: false, error: updateErr.message }, 500);
  }

  const { data: ev, error: evErr } = await supabase.from("inventory_events").insert({
    item_id: resolvedItemId, event_type,
    performed_by: emp.id, performed_by_name: emp.name,
    location: location || null, taken_by: taken_by || null,
    condition: condition || null, vendor: vendor || null,
    linked_ticket_id: linked_ticket_id || null,
    note: note?.trim() || null,
  }).select().single();

  if (evErr) return json({ ok: false, error: evErr.message }, 500);

  const { data: updatedItem } = await supabase.from("inventory_items").select("*").eq("id", resolvedItemId).single();
  return json({ ok: true, event: ev, item: updatedItem });
};
