const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// ── Who did this? ─────────────────────────────────────────────────────────────
// Records who opened / closed a ticket so admins can see each show tech's day.
// Best-effort: it must never stop a ticket being created or closed.
/** The logged-in employee for this request, or null. Never throws. */
async function whoIs(supabase, event) {
  try {
    const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return null;
    const token = auth.slice(7).trim();
    if (!token) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const { data: sess } = await supabase.from("sessions")
      .select("employee_id, expires_at").eq("session_token_hash", hash).limit(1).maybeSingle();
    if (!sess || Date.now() > new Date(sess.expires_at).getTime()) return null;
    const { data: emp } = await supabase.from("employees")
      .select("id, name, role").eq("id", sess.employee_id).maybeSingle();
    return emp || null;
  } catch {
    return null;
  }
}

/** Record that someone opened / fixed / reopened a ticket. Never throws. */
async function logEvent(supabase, ticketId, action, emp, fallbackName) {
  try {
    const { error } = await supabase.from("xmas_ticket_events").insert([{
      ticket_id: ticketId,
      action,
      employee_id: emp ? emp.id : null,
      employee_name: (emp && emp.name) || fallbackName || null,
    }]);
    if (error) console.error("[xmas-events] not recorded:", error.message);
  } catch (e) {
    console.error("[xmas-events] not recorded:", e && e.message);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

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
  // Record who closed / reopened it (for the admin show tech progress view).
  await logEvent(supabase, id, status === "fixed" ? "fixed" : "reopened", await whoIs(supabase, event), null);
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
};
