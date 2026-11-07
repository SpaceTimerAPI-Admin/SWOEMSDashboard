/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * 1. Creates a job row in schedule_upload_jobs (status=pending)
 * 2. Fires off schedule-upload-background (async, no-wait)
 * 3. Returns { ok: true, job_id } immediately so the browser never waits on AI
 *
 * Frontend polls /api/schedule-job-status?id=<job_id> until done/error.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Unauthorized" }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  let body: any = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const image_base64 = String(body.image_base64 || "").trim();
  const content_type = String(body.content_type || "image/jpeg").trim();

  if (!image_base64) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "image_base64 required" }) };
  }

  const supabase = supabaseAdmin();

  // Create job row
  const { data: job, error: jobErr } = await supabase
    .from("schedule_upload_jobs")
    .insert({ status: "pending" })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error("[schedule-upload] Failed to create job:", jobErr?.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Could not create job" }) };
  }

  const job_id = job.id;

  // Fire background function (don't await)
  const bgUrl = `${event.headers["x-forwarded-proto"] || "https"}://${event.headers["host"]}/.netlify/functions/schedule-upload-background`;
  fetch(bgUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id,
      image_base64,
      content_type,
      uploaded_by: session.employee?.id || null,
    }),
  }).catch(() => { /* background — ignore */ });

  return {
    statusCode: 202,
    body: JSON.stringify({ ok: true, job_id }),
  };
};
