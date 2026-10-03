import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

/**
 * GET /api/ticket-inventory?ticket_id=xxx
 * Returns all distinct inventory items linked to a ticket via inventory_events.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const ticket_id = event.queryStringParameters?.ticket_id;
  if (!ticket_id) return badRequest("ticket_id required");

  const supabase = supabaseAdmin();

  // Fetch all inventory events tied to this ticket, joining the item details
  const { data: events, error } = await supabase
    .from("inventory_events")
    .select(`
      id,
      event_type,
      created_at,
      note,
      location,
      performed_by_name,
      item_id,
      inventory_items (
        id,
        name,
        serial_number,
        asset_tag,
        category_name,
        manufacturer,
        model,
        status,
        location
      )
    `)
    .eq("linked_ticket_id", ticket_id)
    .order("created_at", { ascending: true });

  if (error) return json({ ok: false, error: error.message }, 500);

  // Deduplicate items — keep the latest event per item for status
  const itemMap = new Map<string, any>();
  for (const ev of events || []) {
    if (!ev.inventory_items) continue;
    const item = ev.inventory_items as any;
    if (!itemMap.has(item.id)) {
      itemMap.set(item.id, { ...item, events: [] });
    }
    itemMap.get(item.id).events.push({
      id: ev.id,
      event_type: ev.event_type,
      created_at: ev.created_at,
      note: ev.note,
      location: ev.location,
      performed_by_name: ev.performed_by_name,
    });
  }

  return json({ ok: true, items: Array.from(itemMap.values()) });
};
