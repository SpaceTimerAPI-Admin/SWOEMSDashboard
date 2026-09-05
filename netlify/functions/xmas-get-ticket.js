const { createClient } = require("@supabase/supabase-js");

function normalizePhotos(ticket, rows) {
  const out = Array.isArray(rows) ? [...rows] : [];
  const legacyUrl = ticket?.photo_url || null;
  if (legacyUrl && !out.some(p => (p.photo_url || p.url) === legacyUrl)) {
    out.unshift({ id: "primary", ticket_id: ticket.id, photo_url: legacyUrl, created_at: ticket.created_at });
  }
  return out.map(p => ({ ...p, photo_url: p.photo_url || p.url || null })).filter(p => !!p.photo_url);
}

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const id = parseInt(event.queryStringParameters?.id, 10);
  if (!id || isNaN(id)) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Valid id required" }) };

  const { data: ticket, error: tErr } = await supabase.from("xmas_tickets").select("*").eq("id", id).single();
  if (tErr || !ticket) return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Ticket not found" }) };

  const { data: photos } = await supabase.from("xmas_ticket_photos").select("*").eq("ticket_id", id).order("created_at", { ascending: true });
  const { data: comments } = await supabase.from("xmas_ticket_comments").select("id, ticket_id, author, body, created_at").eq("ticket_id", id).order("created_at", { ascending: true });

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, photos: normalizePhotos(ticket, photos || []), comments: comments || [] }) };
};
