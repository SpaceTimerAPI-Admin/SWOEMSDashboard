/**
 * GET /api/xmas-nearby-tickets?lat=28.41&lon=-81.46&radius=120
 *
 * Returns open xmas_tickets within `radius` metres of the given coordinates.
 * Used by the new-ticket form to surface potential duplicates before submit.
 *
 * No auth required (same as other public xmas endpoints).
 */
const { createClient } = require("@supabase/supabase-js");

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function resp(statusCode, obj) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

/** Haversine distance in metres between two lat/lon pairs */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "GET")
    return resp(405, { error: "Method Not Allowed" });

  const qs = event.queryStringParameters || {};
  const lat = parseFloat(qs.lat);
  const lon = parseFloat(qs.lon);
  const radius = parseFloat(qs.radius) || 120; // default 120 m

  if (isNaN(lat) || isNaN(lon))
    return resp(400, { error: "lat and lon are required numeric parameters" });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return resp(500, { error: "Missing Supabase env vars" });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Pull open tickets that have GPS coords — server-side lat/lon bounding box
  // first (cheap), then haversine filter in JS (precise).
  const degreeBuffer = radius / 111000; // ~1° lat ≈ 111 km
  const { data, error } = await supabase
    .from("xmas_tickets")
    .select("id, location_friendly, description, tech_name, created_at, lat, lon, status")
    .eq("status", "open")
    .not("lat", "is", null)
    .not("lon", "is", null)
    .gte("lat", lat - degreeBuffer)
    .lte("lat", lat + degreeBuffer)
    .gte("lon", lon - degreeBuffer)
    .lte("lon", lon + degreeBuffer)
    .order("created_at", { ascending: false });

  if (error)
    return resp(500, { error: "Failed to query tickets", details: error.message });

  // Fine-grained haversine filter
  const nearby = (data || [])
    .map((t) => ({
      ...t,
      distance_m: Math.round(haversine(lat, lon, t.lat, t.lon)),
    }))
    .filter((t) => t.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);

  return resp(200, { ok: true, nearby });
};
