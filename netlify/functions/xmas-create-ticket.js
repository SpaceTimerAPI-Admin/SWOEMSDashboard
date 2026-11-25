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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";
const siteBaseUrl = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/,"");

function resp(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST,OPTIONS" }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "POST") return resp(405, { error: "Method Not Allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return resp(500, { error: "Missing Supabase env vars" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return resp(400, { error: "Bad JSON body" }); }

  const tech_name        = (payload.tech_name || "").trim();
  const location_friendly = (payload.location_friendly || "").trim();
  const description      = (payload.description || "").trim();
  const lat = payload.lat ?? null;
  const lon = payload.lon ?? null;

  let photo_url = payload.photo_url || null;
  const photo_path = payload.photo_path || payload.path || null;
  if (!photo_url && photo_path) {
    photo_url = `${SUPABASE_URL.replace(/\/+$/,"")}/storage/v1/object/public/${BUCKET}/${photo_path}`;
  }

  if (!tech_name)          return resp(400, { error: "tech_name is required" });
  if (!location_friendly)  return resp(400, { error: "location_friendly is required" });
  if (!description)        return resp(400, { error: "description is required" });
  if (!photo_url)          return resp(400, { error: "photo_url is required" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("xmas_tickets")
    .insert([{ tech_name, location_friendly, description, lat, lon, status: "open", photo_url }])
    .select("id")
    .single();

  if (error) return resp(500, { error: "Failed to create ticket", details: error.message });

  // Record who opened it (for the admin show tech progress view).
  await logEvent(supabase, data.id, "opened", await whoIs(supabase, event), tech_name);

  return resp(200, { ok: true, id: data.id, ticket: { id: data.id } });
};
