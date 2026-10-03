import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

/**
 * GET /api/ticket-inventory?ticket_id=xxx  — items linked to a ticket
 * GET /api/ticket-inventory?item_id=xxx    — tickets linked to an inventory item
 *
 * Note: We do NOT use Supabase's join syntax (e.g. tickets(...)) for cross-table
 * joins because the FK constraint may not be registered in Supabase's schema cache.
 * Instead we do two explicit queries and merge in application code.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const ticket_id = event.queryStringParameters?.ticket_id;
  const item_id   = event.queryStringParameters?.item_id;
  if (!ticket_id && !item_id) return badRequest("ticket_id or item_id required");

  const supabase = supabaseAdmin();

  if (item_id) {
    // Step 1: fetch all events for this inventory item that have a linked ticket
    const { data: events, error: evErr } = await supabase
      .from("inventory_events")
      .select("id, event_type, created_at, note, location, performed_by_name, linked_ticket_id")
      .eq("item_id", item_id)
      .not("linked_ticket_id", "is", null)
      .order("created_at", { ascending: true });

    if (evErr) return json({ ok: false, error: evErr.message }, 500);
    if (!events || events.length === 0) return json({ ok: true, tickets: [] });

    // Step 2: collect unique ticket IDs
    const ticketIds = [...new Set(events.map((e: any) => e.linked_ticket_id).filter(Boolean))];

    // Step 3: fetch those tickets directly (no FK join needed)
    const { data: ticketRows, error: tErr } = await supabase
      .from("tickets")
      .select("id, title, status, location, category, created_at")
      .in("id", ticketIds);

    if (tErr) return json({ ok: false, error: tErr.message }, 500);

    // Step 4: build map and attach events
    const ticketMap = new Map<string, any>();
    for (const t of ticketRows || []) {
      ticketMap.set(t.id, { ...t, events: [] });
    }
    for (const ev of events) {
      const bucket = ticketMap.get(ev.linked_ticket_id);
      if (bucket) {
        bucket.events.push({
          id: ev.id, event_type: ev.event_type, created_at: ev.created_at,
          note: ev.note, location: ev.location, performed_by_name: ev.performed_by_name,
        });
      }
    }

    return json({ ok: true, tickets: Array.from(ticketMap.values()) });
  }

  // ── ticket_id mode: items linked to a ticket ──────────────────────────────

  // Step 1: fetch all events for this ticket that have a linked inventory item
  const { data: events, error: evErr } = await supabase
    .from("inventory_events")
    .select("id, event_type, created_at, note, location, performed_by_name, item_id")
    .eq("linked_ticket_id", ticket_id)
    .order("created_at", { ascending: true });

  if (evErr) return json({ ok: false, error: evErr.message }, 500);
  if (!events || events.length === 0) return json({ ok: true, items: [] });

  // Step 2: collect unique item IDs
  const itemIds = [...new Set(events.map((e: any) => e.item_id).filter(Boolean))];

  // Step 3: fetch those inventory items directly
  const { data: itemRows, error: iErr } = await supabase
    .from("inventory_items")
    .select("id, name, serial_number, asset_tag, category_name, manufacturer, model, status, location")
    .in("id", itemIds);

  if (iErr) return json({ ok: false, error: iErr.message }, 500);

  // Step 4: build map and attach events
  const itemMap = new Map<string, any>();
  for (const item of itemRows || []) {
    itemMap.set(item.id, { ...item, events: [] });
  }
  for (const ev of events) {
    const bucket = itemMap.get(ev.item_id);
    if (bucket) {
      bucket.events.push({
        id: ev.id, event_type: ev.event_type, created_at: ev.created_at,
        note: ev.note, location: ev.location, performed_by_name: ev.performed_by_name,
      });
    }
  }

  return json({ ok: true, items: Array.from(itemMap.values()) });
};
