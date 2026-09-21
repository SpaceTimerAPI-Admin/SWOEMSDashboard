import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const id = event.queryStringParameters?.id || "";
  if (!id) return badRequest("id required");

  const supabase = supabaseAdmin();

  const [itemRes, eventsRes] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).single(),
    supabase.from("inventory_events")
      .select("*").eq("item_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (itemRes.error || !itemRes.data) return json({ ok: false, error: "Item not found" }, 404);

  const events = eventsRes.data || [];

  // Fetch linked tickets for any events that have a linked_ticket_id
  const ticketIds = [...new Set(events.filter(e => e.linked_ticket_id).map(e => e.linked_ticket_id))];
  let ticketMap: Record<string, any> = {};
  if (ticketIds.length > 0) {
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, title, location, status, category, closed_at, created_at")
      .in("id", ticketIds);
    if (tickets) {
      for (const t of tickets) ticketMap[t.id] = t;
    }
  }

  // Attach ticket data to each event
  const enrichedEvents = events.map(e => ({
    ...e,
    linked_ticket: e.linked_ticket_id ? (ticketMap[e.linked_ticket_id] || null) : null,
  }));

  // Summary stats
  const totalEvents     = events.length;
  const timesInRepair   = events.filter(e => e.event_type === "sent_to_repair").length;
  const timesDeployed   = events.filter(e => e.event_type === "deployed").length;
  const linkedTicketCount = ticketIds.length;

  return json({
    ok: true,
    item: itemRes.data,
    events: enrichedEvents,
    stats: { totalEvents, timesInRepair, timesDeployed, linkedTicketCount },
  });
};
