/**
 * GET /api/inventory-lookup?serial=XX  — find by serial/asset tag (public, used by dashboard)
 * GET /api/inventory-lookup?q=XX       — search by name/serial/model (authenticated)
 *
 * Public serial lookup for the office dashboard scan flow.
 * Authenticated search for the full app.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json } from "./_shared";

export const handler: Handler = async (event) => {
  const supabase = supabaseAdmin();
  const q = event.queryStringParameters || {};

  // Serial / asset tag exact lookup (public — used by dashboard barcode scanner)
  if (q.serial) {
    const serial = q.serial.trim();
    const { data } = await supabase
      .from("inventory_items")
      .select("id, asset_tag, serial_number, name, manufacturer, model, status, location, category_name, checked_out_to_name, checked_out_at, deployed_to, deployed_by_name, deployed_at, notes")
      .or(`asset_tag.eq.${serial},serial_number.eq.${serial}`)
      .maybeSingle();
    return json({ ok: true, found: !!data, item: data || null });
  }

  // Full text search (for inventory modal in dashboard / app)
  if (q.q) {
    const search = q.q.trim();
    const { data } = await supabase
      .from("inventory_items")
      .select("id, asset_tag, serial_number, name, manufacturer, model, status, location, category_name, checked_out_to_name, deployed_to, deployed_by_name")
      .or(`name.ilike.%${search}%,asset_tag.ilike.%${search}%,serial_number.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%,location.ilike.%${search}%`)
      .order("name")
      .limit(20);
    return json({ ok: true, items: data || [] });
  }

  return json({ ok: false, error: "serial or q param required" }, 400);
};
