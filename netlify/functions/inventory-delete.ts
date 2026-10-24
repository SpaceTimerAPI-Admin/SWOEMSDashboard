import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const body = event.body ? JSON.parse(event.body) : {};
  const { id } = body;

  if (!id) return badRequest("id required");

  const supabase = supabaseAdmin();

  // Verify item exists
  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("id, name")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return json({ ok: false, error: "Item not found" }, 404);

  // Delete the item (cascade will handle inventory_events via FK if set,
  // otherwise delete events first)
  await supabase.from("inventory_events").delete().eq("item_id", id);

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, deleted: id });
};
