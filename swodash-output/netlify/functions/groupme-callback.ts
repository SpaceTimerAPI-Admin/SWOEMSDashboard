import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json } from "./_shared";

/**
 * GroupMe Bot Callback (set this URL in the bot settings).
 * Stores every message payload in Supabase (dedup by message_id).
 *
 * NOTE: GroupMe does not sign these callbacks by default. If you want extra safety,
 * restrict by a shared secret querystring (e.g. ?secret=...) and set it in the bot callback URL.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const secret = process.env.GROUPME_CALLBACK_SECRET;
    if (secret) {
      const qs = event.queryStringParameters || {};
      if (qs.secret !== secret) return json({ ok: false, error: "Forbidden" }, 403);
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const group_id = String(payload.group_id || "");
    const message = payload?.text ?? null;
    const message_id = String(payload?.id || payload?.message_id || "");
    const sender_user_id = payload?.user_id ? String(payload.user_id) : null;
    const sender_name = payload?.name ? String(payload.name) : null;
    const created_at = payload?.created_at
      ? new Date(Number(payload.created_at) * 1000).toISOString()
      : new Date().toISOString();

    const attachments_json = payload?.attachments ?? [];

    // Ignore empty message IDs
    if (!group_id || !message_id) return json({ ok: true, ignored: true });

    // Optional: ignore bot's own messages if you know bot name
    const ignoreName = process.env.GROUPME_BOT_NAME;
    if (ignoreName && sender_name && sender_name.toLowerCase() === ignoreName.toLowerCase()) {
      return json({ ok: true, ignored: true });
    }

    const supabase = supabaseAdmin();

    // Upsert (dedup)
    const { error } = await supabase.from("groupme_messages").upsert({
      group_id,
      message_id,
      sender_user_id,
      sender_name,
      text: message,
      created_at,
      attachments_json,
      raw_payload: payload,
    }, { onConflict: "message_id" });

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
