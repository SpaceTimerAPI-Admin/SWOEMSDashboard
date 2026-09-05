const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";
const siteBaseUrl = (process.env.SITE_BASE_URL || "https://swoems.com").replace(/\/+$/,"");

function resp(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS" }, body: JSON.stringify(obj) };
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

  return resp(200, { ok: true, id: data.id, ticket: { id: data.id } });
};
