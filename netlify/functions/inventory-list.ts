import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const supabase = supabaseAdmin();
  const q = event.queryStringParameters || {};
  const status   = q.status || "";
  const category = q.category || "";
  const search   = q.search || "";

  let query = supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (status)   query = query.eq("status", status);
  if (category) query = query.eq("category_name", category);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,asset_tag.ilike.%${search}%,serial_number.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%,location.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, items: data || [] });
};
