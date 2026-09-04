/**
 * GET  /api/user-preferences         — load current user's preferences
 * POST /api/user-preferences         — save current user's preferences
 *
 * Preferences are stored as a JSON blob on the employees.preferences column.
 * This keeps them server-side so they persist across devices and sessions.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) return unauthorized();
  const emp = (session as any).employee as any;

  const supabase = supabaseAdmin();

  // ── GET — return stored preferences ─────────────────────────────────────
  if (event.httpMethod === "GET") {
    const { data, error } = await supabase
      .from("employees")
      .select("preferences")
      .eq("id", emp.id)
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, preferences: data?.preferences || {} });
  }

  // ── POST — save preferences ──────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    const body = event.body ? JSON.parse(event.body) : {};
    const { preferences } = body;
    if (!preferences || typeof preferences !== "object") {
      return json({ ok: false, error: "preferences object required" }, 400);
    }

    // Merge with existing so partial updates don't wipe other prefs
    const { data: existing } = await supabase
      .from("employees")
      .select("preferences")
      .eq("id", emp.id)
      .single();

    const merged = { ...(existing?.preferences || {}), ...preferences };

    // Limit background image size — max 2MB as base64
    if (merged.backgroundImage && merged.backgroundImage.length > 2_800_000) {
      return json({ ok: false, error: "Background image too large. Please use a smaller photo." }, 400);
    }

    const { error } = await supabase
      .from("employees")
      .update({ preferences: merged })
      .eq("id", emp.id);

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, preferences: merged });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
};
