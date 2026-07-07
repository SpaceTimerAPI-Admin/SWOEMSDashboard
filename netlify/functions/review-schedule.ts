/**
 * GET  /api/review-schedule?week=YYYY-MM-DD  — fetch reviews for a week (Sun–Sat)
 * POST /api/review-schedule                  — create a review
 * PATCH /api/review-schedule                 — update (reschedule, edit note, toggle complete)
 * DELETE /api/review-schedule?id=...         — delete a review
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { requireSession } from "./_auth";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  const supabase = supabaseAdmin();
  const session = await requireSession(event);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const emp = session.employee as any;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === "GET") {
    const week = event.queryStringParameters?.week;
    const itemId = event.queryStringParameters?.item_id;

    // Fetch by specific item (for detail page badge)
    if (itemId) {
      const { data, error } = await supabase
        .from("review_schedules")
        .select("id, item_type, item_id, review_date, note, completed")
        .eq("item_id", itemId)
        .eq("completed", false)
        .order("review_date", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, reviews: data || [] });
    }

    if (!week) return json({ error: "week or item_id param required" }, 400);

    const weekStart = new Date(week + "T12:00:00");
    const weekEnd = new Date(week + "T12:00:00");
    weekEnd.setDate(weekEnd.getDate() + 6);

    const { data, error } = await supabase
      .from("review_schedules")
      .select(`
        id, item_type, item_id, item_title, review_date, note,
        completed, completed_at, created_by, created_at,
        creator:employees!review_schedules_created_by_fkey(name),
        completer:employees!review_schedules_completed_by_fkey(name)
      `)
      .gte("review_date", weekStart.toISOString().slice(0, 10))
      .lte("review_date", weekEnd.toISOString().slice(0, 10))
      .order("review_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, reviews: data || [] });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");
    const { item_type, item_id, item_title, review_date, note } = body;
    if (!item_type || !item_id || !item_title || !review_date) {
      return json({ error: "item_type, item_id, item_title, review_date required" }, 400);
    }
    const { data, error } = await supabase
      .from("review_schedules")
      .insert({ item_type, item_id, item_title, review_date, note: note || null, created_by: emp.id })
      .select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, review: data });
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === "PATCH") {
    const body = JSON.parse(event.body || "{}");
    const { id, review_date, note, completed } = body;
    if (!id) return json({ error: "id required" }, 400);
    const updates: any = {};
    if (review_date !== undefined) updates.review_date = review_date;
    if (note !== undefined) updates.note = note;
    if (completed === true) {
      updates.completed = true;
      updates.completed_at = new Date().toISOString();
      updates.completed_by = emp.id;
    } else if (completed === false) {
      updates.completed = false;
      updates.completed_at = null;
      updates.completed_by = null;
    }
    const { data, error } = await supabase
      .from("review_schedules").update(updates).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, review: data });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (event.httpMethod === "DELETE") {
    const id = event.queryStringParameters?.id;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("review_schedules").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};
