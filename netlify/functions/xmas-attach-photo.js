const { createClient } = require("@supabase/supabase-js");
const BUCKET = process.env.TICKET_PHOTOS_BUCKET || "ticket-photos";
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const ticketId = Number(payload.ticket_id || payload.id);
  const note = (payload.note || payload.description || "").trim();
  const photoBase64 = payload.photoBase64;
  const photoFilename = payload.photoFilename;
  if (!ticketId || isNaN(ticketId)) return { statusCode: 400, body: JSON.stringify({ error: "ticket_id required" }) };
  if (!photoBase64 || !photoFilename) return { statusCode: 400, body: JSON.stringify({ error: "Photo required" }) };
  const { data: t, error: tErr } = await supabase.from("xmas_tickets").select("*").eq("id", ticketId).single();
  if (tErr || !t) return { statusCode: 404, body: JSON.stringify({ error: "Ticket not found" }) };
  let photoUrl = null;
  try {
    const base64Data = photoBase64.includes(",") ? photoBase64.split(",")[1] : photoBase64;
    const buffer = Buffer.from(base64Data, "base64");
    const ext = (photoFilename.split(".").pop() || "jpg").toLowerCase();
    const path = `xmas-${ticketId}-${Date.now()}.${ext}`;
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType });
    if (upErr) return { statusCode: 500, body: JSON.stringify({ error: "Upload failed", details: upErr.message }) };
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    photoUrl = pub.publicUrl;
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: "Upload exception", details: e.message }) }; }
  await supabase.from("xmas_ticket_photos").insert([{ ticket_id: ticketId, photo_url: photoUrl }]);
  if (!t.photo_url) await supabase.from("xmas_tickets").update({ photo_url: photoUrl }).eq("id", ticketId);
  if (note) await supabase.from("xmas_ticket_comments").insert([{ ticket_id: ticketId, author: payload.author || "Update", body: note }]);
  return { statusCode: 200, body: JSON.stringify({ ok: true, photoUrl }) };
};
