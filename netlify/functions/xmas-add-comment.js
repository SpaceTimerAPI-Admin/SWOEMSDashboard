const { createClient } = require("@supabase/supabase-js");
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const ticketId = Number(payload.ticket_id || payload.ticketId || payload.id);
  const author = (payload.author || "").trim();
  const body = (payload.body || payload.comment || "").trim();
  if (!ticketId || isNaN(ticketId)) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ticket_id required" }) };
  if (!author) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "author required" }) };
  if (!body) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "body required" }) };
  const { data: inserted, error } = await supabase.from("xmas_ticket_comments").insert([{ ticket_id: ticketId, author, body }]).select().single();
  if (error) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to add comment", details: error.message }) };
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, comment: inserted }) };
};
