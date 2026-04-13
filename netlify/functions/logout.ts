import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, sha256Hex, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    // Extract the raw token from the Authorization header and delete its DB row
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const token = auth.slice(7).trim();
    const tokenHash = sha256Hex(token);

    const supabase = supabaseAdmin();
    await supabase.from("sessions").delete().eq("session_token_hash", tokenHash);

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
