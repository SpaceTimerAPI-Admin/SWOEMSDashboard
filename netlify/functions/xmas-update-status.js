const { createClient } = require("@supabase/supabase-js");
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const id = Number(payload.id || payload.ticket_id);
  const status = (payload.status || "").trim().toLowerCase();
  if (!id || isNaN(id)) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "id required" }) };
  if (!["open", "fixed"].includes(status)) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "status must be open or fixed" }) };
  const { error } = await supabase.from("xmas_tickets").update({ status }).eq("id", id);
  if (error) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to update", details: error.message }) };
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
};
