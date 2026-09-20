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

  return json({ ok: true, item: itemRes.data, events: eventsRes.data || [] });
};
