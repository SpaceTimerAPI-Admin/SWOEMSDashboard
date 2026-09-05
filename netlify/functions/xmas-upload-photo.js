/**
 * netlify/functions/xmas-upload-photo.js
 * Uploads a photo to Supabase Storage for Christmas tickets.
 * Accepts JSON: { base64: "...", contentType?: "image/jpeg" }
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

function rand(n) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "POST") return resp(405, { error: "Method Not Allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return resp(500, { error: "Missing Supabase env vars" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return resp(400, { error: "Bad JSON body" }); }

  if (!payload.base64) return resp(400, { error: "Missing base64" });

  const fileContentType = payload.contentType || "image/jpeg";
  const fileBuf = Buffer.from(payload.base64, "base64");
  if (!fileBuf || fileBuf.length === 0) return resp(400, { error: "Empty upload" });

  const ext = fileContentType.toLowerCase().includes("png") ? "png" : "jpg";
  const path = "xmas-" + Date.now() + "-" + rand(12) + "." + ext;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuf, { contentType: fileContentType, upsert: false, cacheControl: "3600" });

  if (upErr) return resp(500, { error: "Failed to upload photo", details: upErr.message || String(upErr) });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return resp(200, { ok: true, path, publicUrl: data?.publicUrl || null });
};
