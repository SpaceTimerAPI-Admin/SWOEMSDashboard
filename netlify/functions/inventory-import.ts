/**
 * POST /api/inventory-import
 * Bulk import from Excel data (array of row objects).
 * Admin/EMS only.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();
  const emp = (session as any).employee as any;
  if (emp.role === "show_tech") return json({ ok: false, error: "Forbidden" }, 403);

  const body = event.body ? JSON.parse(event.body) : {};
  const rows: any[] = body.rows || [];
  if (!rows.length) return json({ ok: false, error: "No rows provided" }, 400);

  const supabase = supabaseAdmin();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const name = String(row.name || row.Name || row.item || row.Item || "").trim();
      if (!name) { skipped++; continue; }

      const serial = String(row.serial || row.serial_number || row.Serial || row["Serial Number"] || "").trim();
      const category = String(row.category || row.Category || "Other").trim();
      const manufacturer = String(row.manufacturer || row.Manufacturer || row.make || row.Make || "").trim();
      const model = String(row.model || row.Model || "").trim();
      const location = String(row.location || row.Location || "Shop").trim();
      const notes = String(row.notes || row.Notes || "").trim();

      // Generate asset tag
      let asset_tag = serial;
      if (!asset_tag) {
        const { data: tagData } = await supabase.rpc("generate_asset_tag");
        asset_tag = tagData || `SWO-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      }

      // Skip if asset_tag already exists
      const { data: existing } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("asset_tag", asset_tag)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      let category_id: string | null = null;
      const { data: cat } = await supabase.from("inventory_categories").select("id").eq("name", category).maybeSingle();
      category_id = cat?.id || null;

      const { data: item, error } = await supabase
        .from("inventory_items")
        .insert({
          asset_tag,
          serial_number: serial || null,
          name,
          manufacturer: manufacturer || null,
          model: model || null,
          category_id,
          category_name: category || "Other",
          status: "in_storage",
          location,
          notes: notes || null,
        })
        .select("id")
        .single();

      if (error) { errors.push(`${name}: ${error.message}`); continue; }

      await supabase.from("inventory_events").insert({
        item_id: item.id,
        event_type: "received",
        performed_by: emp.id,
        performed_by_name: emp.name,
        location,
        note: "Imported from Excel",
      });

      imported++;
    } catch (e: any) {
      errors.push(`Row error: ${e?.message}`);
    }
  }

  return json({ ok: true, imported, skipped, errors: errors.slice(0, 20) });
};
