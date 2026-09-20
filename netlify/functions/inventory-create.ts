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
  const { name, serial_number, category_name, manufacturer, model, location, purchase_date, vendor, cost_usd, notes } = body;

  if (!name?.trim()) return badRequest("name required");

  const supabase = supabaseAdmin();

  // Generate asset tag if no serial provided
  let asset_tag = (serial_number || "").trim();
  if (!asset_tag) {
    const { data: tagData } = await supabase.rpc("generate_asset_tag");
    asset_tag = tagData || `SWO-${Date.now()}`;
  }

  // Resolve category id
  let category_id: string | null = null;
  if (category_name) {
    const { data: cat } = await supabase.from("inventory_categories").select("id").eq("name", category_name).maybeSingle();
    category_id = cat?.id || null;
  }

  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      asset_tag,
      serial_number: serial_number?.trim() || null,
      name: name.trim(),
      manufacturer: manufacturer?.trim() || null,
      model: model?.trim() || null,
      category_id,
      category_name: category_name || null,
      status: "in_storage",
      location: location?.trim() || "Shop",
      purchase_date: purchase_date || null,
      vendor: vendor?.trim() || null,
      cost_usd: cost_usd || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return json({ ok: false, error: error.message }, 500);

  // Log received event
  await supabase.from("inventory_events").insert({
    item_id: item.id,
    event_type: "received",
    performed_by: emp.id,
    performed_by_name: emp.name,
    location: location?.trim() || "Shop",
    note: notes?.trim() || "Item added to inventory",
  });

  return json({ ok: true, item });
};
